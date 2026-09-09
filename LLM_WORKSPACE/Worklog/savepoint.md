# 箱目録 作業 SavePoint

更新: 2026-09-09
対象: `mayusaki3/hakomokuroku`
ブランチ: `develop`

## 1. 作業目的

箱目録を完成させる。HLDocS v0.7.0 は作業管理・仕様整理に利用するが、HLDocS自体の未完成・不整合を箱目録完成のブロッカーにしない。

作業順は、要件確認 → 利用者確認 → 設計 → 利用者確認 → テストケース → 利用者確認 → テストコード → 実装 → 検証。重要判断には根拠を残す。現在は設計段階であり、アプリケーションコードはまだ変更しない。

詳細記録: `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`

## 2. 現在位置

**全体アーキテクチャ / データモデル / 同期設計の最終確定中。**

## 3. 主要確定事項

### リリース・業務
- v0.8 = Vision以外の完成版
- v1.0 = v0.8 + Vision/LLM画像認識
- 登録順序 = 箱登録 → アイテム → 箱写真 → ラベル → 場所
- 写真フィールド = `thumbs`
- QR payload = Box.codeのみ
- Item「取り出す」= `boxId=UNASSIGNED` の通常UPDATE
- Item「削除」= DELETE/tombstone
- Box削除 = 子ItemをUNASSIGNEDへ移動後Boxをtombstone
- BoxLocationは独立フラットマスタ。Boxが `locationId` を参照
- Vision対象はBox/Item写真のみ

### ユーザー間データ分離原則
**確定:** ユーザー間のデータは論理的に完全分離する。物理DB・object storageを共有しても、データ空間・参照・検索・同期・重複排除・GCは認証済み内部 `User.id` のscope内で完結させる。

- business entity identity = `(User.id, entityId)`
- APIのuser scopeはclient payloadではなく認証session/tokenからserverが確定
- 異なるUser間では同一entity id / photoHash / bytesでも共有しない
- PhotoBlobもUser間共有しない
- 異なるUserのblob存在有無を推測できるAPI挙動にしない
- 同一User内では同一photoHash blobを再利用可能
- SyncChangeLog / SyncConflict / FullSyncSnapshot / cursor validity / Full Resyncもuser単位
- local DB = `hk-local-v2-<User.id>`

### 同期アーキテクチャ
- server metadata = `createdAt, updatedAt, deletedAt, serverUpdatedAt, revision, contentHash, syncSeq`
- 未同期新規 = revision 0 / baseRevision 0
- baseRevision一致 = 通常更新
- revision不一致時はcontentHash比較。同一=UNCHANGED、異なる=CONFLICT
- SyncChangeLogがPull差分履歴の正本
- syncSeqはDB全体で一意な単調増加signed 64-bit
- local 3層 = Business / SyncState / Outbox
- local業務変更 + Outboxは同一IndexedDB transaction
- 通常同期 = Pull → Outbox reapply → Push → Pull
- Push中再編集はoutboxVersionで保護

### business timestamp
- createdAt / updatedAt / deletedAt = business時刻
- serverUpdatedAt = server canonical更新時刻
- 新規CREATEはclient.createdAt採用
- 既存UPDATE/復活ではcanonical createdAt維持
- client updatedAt/deletedAtは有効形式ならserver時刻で上書きしない
- server自身がbusiness変更主体ならserver操作時刻を使用
- client business timestampは競合勝者・Pull順序・cursor・retentionに使わない
- RFC3339/ISO8601、offset必須、server保存UTC、milliseconds
- 形式として有効なら極端な未来/過去でも補正しない

### contentHash
- business上の意味的内容だけをhash化
- timestamp値・server metadata・userId・entity idは対象外
- active/deleted状態は対象
- deterministic JSON + SHA-256相当

### 写真hash
- 保存された原画像データから `photoHash` を決定的に算出
- 高度な画像正規化はしない
- 再保存/再エンコードでbytesが変われば写真更新扱い
- entity contentHashには順序付きphotoHash列を含める
- 写真順序はbusiness上有意

### 写真同期payload
**確定:** 原画像blobはentity JSONから分離。thumbnailはentity JSONへ埋め込む。

```text
entity JSON
- photoHash
- thumbnail
- 写真順序

原画像
- blobとして別転送
```

- `photoId` は持たない
- `photoHash` が原画像blobの論理識別子
- thumbnail base64そのものはcontentHashへ直接含めない
- Outboxで原画像blobを重複保持しない

### 原画像取得・cache
**確定:** Pull / Full Resyncではthumbnail + metadataのみ。原画像は必要時オンデマンド取得し、一度取得したものはuser別local DBへcacheする。

- cache未取得は同期異常ではない
- 原画像取得失敗はentity同期成功を取り消さない
- offline時はcache済み原画像を表示、未取得ならthumbnail表示
- photoHashが変われば旧cacheを新写真として使わない

### 原画像upload順序
**確定:** blob upload成功 → entity Push の順。

```text
1. client photoHash算出
2. blob upload
3. serverがblob存在/photoHash確認
4. entity Push
5. canonical参照確定
```

- blob upload失敗ならentity Pushしない
- upload成功後のPush失敗/CONFLICT/結果不明でもblobは即削除しない
- 同一User内の既upload blobは再利用可能
- blob upload成功だけではentity同期成功ではない

### PhotoBlob識別子
**確定:** `photoId` は別に設けず、`photoHash` をそのままPhotoBlobの論理識別子にする。

概念:

```text
PhotoBlob
- userId
- photoHash
- blob情報
- unreferencedSince
```

論理一意キー:

```text
(User.id, photoHash)
```

規則:
- entity側の写真参照は `photoHash` のみで行う
- 同一User内で同じphotoHashなら同じPhotoBlobを参照・再利用する
- 異なるUser間では同じphotoHashでも別PhotoBlobとして扱う
- blob upload / exists / download / GC lookup は `(User.id, photoHash)` scope
- `photoId` という追加識別子は持たない
- 将来hash方式を変更する場合は、写真再hash、entityのphotoHash更新、entity contentHash再計算、同期整合性更新を含む明示的な全体migrationとして扱う
- hash方式変更の可能性だけを理由に現時点で参照IDを二重化しない

根拠: photoHashはすでに写真内容の同一性判定とentity contentHashの入力としてbusiness同期設計に組み込まれているため、hash方式変更時にはphotoIdを別に持っていても全体migrationを避けられない。現時点では識別子を増やすより `(User.id, photoHash)` に統一した方が実装・API・テスト・GCが単純である。

### PhotoBlob重複排除scope
**確定:** 同一User内のみ。

```text
same User.id + same photoHash → blob再利用可能
different User.id + same photoHash → 別blob
```

### 未参照PhotoBlob GC
**確定:** 未参照状態が30日継続したblobは物理削除可能。

- server管理時刻で `unreferencedSince` を管理
- 30日以内に再参照されたらGC対象解除
- 30日は最低保持期間
- GC job直前に再度参照有無確認
- tombstone 30日保持と期間は合わせるが、別ライフサイクル

### PhotoBlob参照管理
**確定:** reference countを正本として保持しない。canonical entityの実参照を正本としてGC判定する。

規則:
- Box / Item / BoxLocation のcanonical写真参照がPhotoBlob参照の正本
- referenceCount列は正本として持たない
- 写真削除・差し替え・CONFLICT解決等で参照が外れた際、同一User内のcanonical参照を確認し、ゼロなら`unreferencedSince`をserver時刻で設定
- その後再参照されたら`unreferencedSince=null`
- GC時は`unreferencedSince <= now-30days`だけを候補化し、削除直前に同一User内のBox / Item / BoxLocationを再検索して実参照ゼロを確認
- 実参照があれば削除禁止、`unreferencedSince`は必要に応じて解除

根拠: reference countを正本にすると複数の同期・競合・cascade経路すべてで厳密な加減算が必要になり、更新漏れが誤削除につながる。GCは30日後の非同期処理なので、canonical参照を再確認する方式の方が安全で単純。

### tombstone / SyncChangeLog
- tombstone物理削除可能 = DELETE受理server時刻 + 30日
- SyncChangeLog保持 = 90日
- 必要log欠落/完全性保証不能ならFULL_RESYNC_REQUIRED

### Outbox
- 同一 `(entityType, entityId)` につき1 rowのlatest unsynced candidate
- CREATE/UPDATE/DELETEをfoldし、original baseRevisionを維持
- local変更ごとにoutboxVersion++
- PullだけではbaseRevisionを進めない
- CREATE→DELETEでもOutboxを消さない

### DELETE / CONFLICT / UNASSIGNED
- Box DELETE → child Item.boxId=UNASSIGNED
- BoxLocation DELETE → child Box.locationId=UNASSIGNED
- parent DELETE + child補正はserver 1 transaction
- reserved Box/BoxLocation `UNASSIGNED` を各Userで保証
- reserved entityはclient変更禁止
- SyncConflictは `(userId, entityType, entityId)` につき未解決1 row

### Pull / Full Resync
- Pull = `changes[] / nextCursor / hasMore`、syncSeq順
- page local適用成功後のみcursor更新
- cursor未設定の新規DBは必ずFull Resync
- Full Resyncはcurrent active canonicalのみ
- snapshotSeq=Nを固定し、type別paging
- staging完了後のみlocal canonicalへ採用
- 既存canonicalありならFull Resync中もlocal編集可
- adoptionは1 IndexedDB transaction
- Outbox reapply順 = BoxLocation → Box → Item

## 4. 現行実装との差異
- Prisma sync metadata不足
- entity idがglobal PKでuser composite identity未対応
- current Push ownership risk
- revision/contentHash/Outbox/SyncState/Conflict未実装
- Pullはtimestamp基準
- IndexedDB固定 `hk-local-v1`
- BoxLocationモデル不一致
- backupのphotoThumbs/thumbs不一致、BoxLocation不足
- Full Resync snapshot/staging未実装
- photoHash未実装
- 原画像blob分離同期・オンデマンドcache未実装
- blob先行upload / entity後確定未実装
- user-scoped blob dedup未実装
- 未参照blob 30日GC未実装
- canonical実参照ベースGC未実装
- PhotoBlobの `(User.id, photoHash)` 識別未実装

## 5. ロードマップ
0. 現状棚卸し — 完了
1. v0.8 / v1.0 要件仕様 — 主要方針確定
2. 全体アーキテクチャ確定 — **現在（最終点検）**
3. データモデル・同期仕様確定
4. 箱・アイテム・写真・置き場所仕様完成
5. QR・検索仕様完成
6. バックアップ・PWA・印刷仕様完成
7. 各機能テストケース完成
8. 不足テスト実装
9. 既存実装修正
10. v0.8完成・受入
11. Vision/LLM詳細要件・設計・テスト
12. Vision/LLM実装完成
13. v1.0完成・受入

## 6. 次のアクション

同期設計の主要未定義を最終点検する。

次の判断候補:
**PhotoBlob upload時の完全性検証を、client申告photoHashとserver再計算の一致確認まで必須にするか確定する。**

client申告値だけを信用すると破損・実装不整合で誤ったblob識別が成立し得る。一方server側再hashはupload時のCPUコストを増やすため、次に要否を確定する。

## 7. HLDocS運用上の注意
HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
