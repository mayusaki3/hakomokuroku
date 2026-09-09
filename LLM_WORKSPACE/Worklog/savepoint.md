# 箱目録 作業 SavePoint

更新: 2026-09-10
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

### ユーザー間データ分離
- ユーザー間のデータは論理的に完全分離
- business identity = `(User.id, entityId)`
- APIのuser scopeはclient payloadではなく認証session/tokenからserverが確定
- 異なるUser間ではentity / photoHash / PhotoBlob / sync状態を共有しない
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

### 写真hash / PhotoBlob
- 保存された原画像bytesから `photoHash` をSHA-256相当で算出
- 高度な画像正規化はしない
- 再保存/再エンコードでbytesが変われば写真更新扱い
- entity contentHashには順序付きphotoHash列を含める
- 写真順序はbusiness上有意
- `photoId` は持たず、`photoHash` 自体をPhotoBlobの論理識別子にする
- PhotoBlob論理キー = `(User.id, photoHash)`
- 同一User内のみ同一photoHash blobを再利用可能
- 異なるUser間では同じphotoHashでも共有しない
- hash方式変更は全体migrationとして扱い、将来可能性だけを理由に参照IDを二重化しない

### 写真同期payload
- 原画像blobはentity JSONから分離
- entity JSONは `photoHash + thumbnail + 写真順序`
- thumbnail base64そのものはcontentHashへ直接含めない
- Outboxで原画像blobを重複保持しない

### 原画像取得・cache
- Pull / Full Resyncではthumbnail + metadataのみ同期
- 原画像は必要時オンデマンド取得
- 一度取得した原画像はuser別local DBへcache
- cache未取得は同期異常ではない
- 原画像取得失敗はentity同期成功を取り消さない
- offline時はcache済み原画像を表示、未取得ならthumbnail表示
- photoHashが変われば旧cacheを新写真として使わない

### 原画像upload順序
```text
1. client photoHash算出
2. blob upload
3. server hash検証
4. entity Push
5. canonical参照確定
```

- blob upload失敗ならentity Pushしない
- upload成功後のPush失敗/CONFLICT/結果不明でもblobは即削除しない
- 同一User内の既upload blobは再利用可能
- blob upload成功だけではentity同期成功ではない

### PhotoBlob upload時hash完全性検証
- client申告 `photoHash` をserver側で信用しない
- serverは受信した保存対象原画像bytesからSHA-256相当を再計算
- client申告値とserver計算値の一致を必須とする
- 不一致ならPhotoBlobを利用可能状態にせず、entity Pushへ進まない
- transport failureとhash mismatchを区別する
- hash mismatchは原則retryable=falseのデータ整合性エラー

根拠: photoHashはPhotoBlob識別子かつentity contentHashの入力であり、実bytesとの不一致を許すとdedup/cache/同期競合判定まで連鎖的に壊れるため。

### thumbnail生成・検証
**確定:** thumbnailはclient生成を正本とし、serverは再生成しない。既存実装 `makeThumbWebp()` の既定値を正式仕様として採用する。

```text
形式        : WebP
長辺上限    : 400 px
quality     : 0.8
拡大        : しない
向き        : EXIF Orientation補正後
生成主体    : client
最大byte数  : 256 KiB
contentHash : 対象外
```

同期フロー:

```text
client
原画像
→ photoHash算出
→ EXIF Orientation補正
→ 長辺400px以内へ縮小（小さい画像は拡大しない）
→ WebP quality 0.8でthumbnail生成
→ local Businessへ保存

同期
原画像blob upload
→ server hash検証
→ entity Push
   - photoHash
   - thumbnail
→ server thumbnail妥当性検証
```

server検証:
- `image/webp` としてdecode可能であること
- width > 0 / height > 0
- width <= 400 / height <= 400
- encoded thumbnail bytes <= 256 KiB
- 検証NGならentity payloadをREJECTEDとして扱う
- serverはthumbnailを再生成・差し替えしない
- thumbnail bytesはcontentHash対象外
- 同一原画像でも端末実装差でthumbnail bytesが異なり得るが、写真同一性は原画像のphotoHashで判定する
- Pull / Full Resyncではcanonical entityに保存されたthumbnailを配信する

根拠: 箱目録はoffline-firstであり写真追加直後からthumbnailが必要。既存実装が長辺400px / WebP / quality 0.8 / EXIF補正をすでに行っているため、新しい値へ変更するより既存挙動を仕様化する方が移行コストと不整合を減らせる。256 KiBは400px WebPとして十分な余裕を持たせつつ、entity JSONへ異常に大きなthumbnailが混入することを防ぐ上限とする。

### PhotoBlob GC
- 未参照状態30日継続で物理削除可能
- `unreferencedSince` はserver管理時刻
- reference countを正本として持たず、Box / Item / BoxLocation canonicalの実参照を正本とする
- GC直前に同一User内の実参照ゼロを再確認
- 再参照されたら `unreferencedSince=null`

### tombstone / SyncChangeLog
- tombstone物理削除可能 = DELETE受理server時刻 + 30日
- SyncChangeLog保持 = 90日
- 必要log欠落/完全性保証不能ならFULL_RESYNC_REQUIRED

### Outbox / Conflict / DELETE
- 同一 `(entityType, entityId)` につき1 Outbox rowのlatest unsynced candidate
- original baseRevision維持、local変更ごとにoutboxVersion++
- CREATE→DELETEでもOutboxを消さない
- Box DELETE → child Item.boxId=UNASSIGNED
- BoxLocation DELETE → child Box.locationId=UNASSIGNED
- parent DELETE + child補正はserver 1 transaction
- reserved Box/BoxLocation `UNASSIGNED` を各Userで保証しclient変更禁止
- SyncConflictは `(userId, entityType, entityId)` につき未解決1 row

### Pull / Full Resync
- Pull = `changes[] / nextCursor / hasMore`、syncSeq順
- page local適用成功後のみcursor更新
- cursor未設定の新規DBは必ずFull Resync
- Full Resyncはcurrent active canonicalのみ
- snapshotSeq=Nを固定しtype別paging
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
- PhotoBlob `(User.id, photoHash)` 識別未実装
- server-side photoHash再検証未実装
- canonical実参照ベース30日GC未実装
- client正本thumbnail + server妥当性検証未実装
- thumbnail 256 KiB上限server検証未実装

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

同期・写真設計の主要未定義を最終点検する。

次の判断候補:
**serverへ保存する原画像blobの画像形式・寸法・byte数上限を定めるか、clientが保存した画像を原則そのまま受理するかを確定する。**

現行実装には原画像相当を長辺1600px・WebP quality 0.85へ縮小する `downscaleToWebp()` があるため、その既存挙動を「保存原画像」の正式仕様とするかを次に判断する。

## 7. HLDocS運用上の注意
HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
