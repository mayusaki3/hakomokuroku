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

### 同期アーキテクチャ
- business identity = `(User.id, entityId)`
- server同期メタデータ = `createdAt, updatedAt, deletedAt, serverUpdatedAt, revision, contentHash, syncSeq`
- 未同期新規 = revision 0 / baseRevision 0
- revision不一致時はcontentHash比較。同一=UNCHANGED、異なる=CONFLICT
- SyncChangeLogがPull差分履歴の正本
- syncSeqはDB全体で一意な単調増加signed 64-bit
- user別local DB = `hk-local-v2-<User.id>`
- local 3層 = Business / SyncState / Outbox
- local業務変更とOutbox更新は同一IndexedDB transaction
- PushはOutbox基準、sync中再編集はoutboxVersionで保護
- 通常同期 = Pull → Outbox reapply → Push → Pull

### business時刻とserver時刻
- `createdAt / updatedAt / deletedAt` はbusiness上の時刻
- `serverUpdatedAt` はserver canonical更新時刻
- 新規CREATE（baseRevision=0）はclient.createdAtを採用
- 既存entityのUPDATE/復活ではcanonicalのcreatedAtを維持
- reserved / server自動生成entityのcreatedAtはserver時刻
- client編集のupdatedAtはPush受理時にserver時刻で上書きしない
- server自身がbusiness変更した場合、そのserver操作時刻をupdatedAtとする
- client DELETEのdeletedAtはclient削除時刻を保持
- server自身がDELETE主体の場合はserver操作時刻をdeletedAtとする
- DELETE後に同一IDを復活させてもcreatedAtは元値を維持、updatedAtは復活操作時刻、deletedAt=null
- business timestampは競合勝者判定、Pull順序、cursor判定に使用しない
- 同期整合性は revision / contentHash / syncSeq を基準とする

### client由来business時刻の異常値
**確定:** timestamp形式として有効なら極端な過去・未来でもserverで補正しない。形式不正のみREJECTED。同期整合性・retentionはclient business時刻に依存しない。

### timestamp表現形式
**確定:** RFC 3339互換ISO 8601、timezone offset必須。server canonical保存時はUTCへ正規化、標準精度milliseconds、元offsetは保持しない。

### contentHash対象範囲
**確定:** business上の意味的内容だけを表し、business timestamp値や同期制御メタデータは含めない。ただしactive/deleted状態は含める。

対象外: `createdAt`, `updatedAt`, `deletedAt`時刻値, `serverUpdatedAt`, `revision`, `syncSeq`, `contentHash`, `userId`, entity id。
対象: business本文、business参照、写真等のbusiness内容、active/deleted状態。

canonicalizationは、順序非依存配列はsort、object key順固定、決定的JSON化後にSHA-256相当でhash化する。

### 写真とcontentHash
**確定:** Box / Itemの写真は`photoHash`を介してentityの`contentHash`へ含め、写真配列の順番もbusiness内容として扱う。画像内容の高度な正規化は行わない。

```text
保存された写真データ
→ photoHash = 保存データから決定的に算出

Box / Item contentHash
→ business本文
→ business参照
→ 順序付きphotoHash列
→ active / deleted状態
```

- photoHashはSHA-256相当
- EXIF除去、pixel展開、色空間統一、再エンコード同一視等は要件としない
- 利用者が画像を変換・再保存して保存内容が変われば写真更新として扱う
- `[photoA, photoB]` と `[photoB, photoA]` は異なるbusiness内容
- BoxLocation写真も同じ同一性ルールを適用可能だがVision対象はBox/Itemのみ

### 写真同期payload
**確定:** 原画像はentity JSONへ埋め込まず、写真blobとしてentity同期とは分離して転送する。サムネイルはentity JSONへ埋め込む。

```text
entity JSON
- photoId / blob参照
- photoHash
- thumbnail
- 写真順序

写真本体
- blobとして別転送
```

- 原画像blobはPush/Pull/Full Resyncの通常entity JSONから分離
- entity側は写真参照、photoHash、順序、thumbnailを保持
- thumbnailはJSON埋め込み
- entity contentHashは順序付きphotoHash列を使用し、thumbnail base64自体はhashへ直接含めない
- Outboxで同一blobをentity payloadごとに複製しない

### 原画像blob取得・キャッシュ
**確定:** 通常Pull / Full Resyncでは原画像blobを自動取得しない。thumbnailとphoto metadataだけ同期し、原画像は必要時にオンデマンド取得。一度取得した原画像はuser別local DB側へcacheし、オフライン再表示に利用する。

```text
Pull / Full Resync
→ thumbnail + photo metadata
→ 原画像blobは取得しない

原画像表示要求
→ local cache確認
→ cacheあり: local表示
→ cacheなし & ONLINE: serverから取得してcache後表示
→ cacheなし & OFFLINE: thumbnail表示
```

- 原画像取得はcursor/revision/contentHash進行の前提条件としない
- blob取得失敗はentity同期成功を取り消さない
- cache未取得は同期異常ではない
- photoHashまたは参照が変われば旧cacheを新写真として利用しない

### 原画像blob uploadとentity Push順序
**確定:** 新規・更新写真は、原画像blob upload成功後にentity Pushを行う。canonical entityが未存在blobを参照する状態を作らない。

```text
1. clientでphotoHash算出
2. 原画像blobをserverへupload
3. serverがblob存在 / photoHashを確認
4. entity Push
5. entity canonicalへphotoId / photoHash / thumbnail / 順序を確定
```

規則:
- entity Push時に参照するblobはserver側で利用可能でなければならない
- blob upload失敗時はentity Pushを行わず、Outboxとlocal Businessは保持する
- blob upload成功後にentity Pushが失敗・CONFLICT・通信結果不明となってもblobは直ちに削除しない
- 同一photoHash / 同一blobがserverに既に存在し再利用可能なら再uploadを避けられる設計とする
- entity Push再送時は既upload blobを再利用できる
- canonical entityが存在しないblobを参照する状態を正常系では作らない
- blob upload成功だけではentity同期成功とは扱わない
- entityのOutboxはentity PushがAPPLIED/UNCHANGED等で成功するまで保持する

根拠: entity先行だとcanonicalが未upload原画像を参照する時間窓が生じる。blob先行なら失敗時に未参照blobが残るだけで、business canonicalの参照整合性を保ちやすい。未参照blobは再送で再利用し、不要になったものは別途GC対象にできる。

### 未参照原画像blobのGC
**確定:** server側でentityから参照されていない原画像blobは即時削除せず、未参照状態が30日継続した場合にGCで物理削除可能とする。

```text
blob upload成功
↓
entityから参照あり
→ 保持

entity Push失敗 / 写真差し替え / 写真削除 / CONFLICTでSERVER wins
↓
未参照blob
↓
未参照状態30日保持
↓
GC実行時にも未参照
→ 物理削除可能
```

規則:
- GC判定はserver管理時刻を基準とし、client時刻に依存しない
- 未参照になった時点をserverで記録し、その時点から30日を起算する
- 30日以内に再度entityから参照された場合はGC対象から外す
- 同じblobが複数entityから参照され得る場合、全参照がなくなった時点から未参照期間を起算する
- entity Push再送・CONFLICT解決・通信結果不明により後から参照が成立する可能性を考慮し、即時削除しない
- GC実行直前にも参照有無を再確認し、参照中blobを削除しない
- tombstoneの30日保持と期間を揃えるが、blob GCとtombstone purgeは別のライフサイクルとして管理する
- 30日は最低保持期間であり、GC job実行周期により実際の削除は30日以降となってよい

根拠: blob先行uploadではentity確定前に通信失敗やCONFLICTが起き、正常な再送で後から参照される一時孤立blobが発生し得る。即時削除すると再uploadや競合解決との競合が生じるため、30日の猶予を置く。tombstone保持期間とも揃えることで運用・テスト条件を単純化できる。

### deletedAt / tombstone保持起算
- tombstoneはDELETEをcanonicalへ受理したserver管理時刻 + 30日後に物理削除可能
- deletedAtそのものはpurge起算に使用しない
- deleted状態ではDELETE受理時のserverUpdatedAtをpurge起算に利用可能
- SyncChangeLogは固定90日保持
- 必要log欠落または完全性保証不能ならFULL_RESYNC_REQUIRED

### Outbox
同一 `(entityType, entityId)` につき1 row、latest unsynced candidate。

```text
CREATE + 編集 → CREATE / baseRevision=0維持
CREATE + DELETE → DELETE / baseRevision=0維持
UPDATE + 編集 → UPDATE / 元baseRevision維持
UPDATE + DELETE → DELETE / 元baseRevision維持
baseRevision=0 の CREATE→DELETE→復活 → CREATE
baseRevision>0 の UPDATE→DELETE→復活 → UPDATE
```

- local変更ごとにoutboxVersion++
- CREATE/UPDATEは最新payload + contentHash
- DELETEはdelete-state contentHash、payload原則null
- Outbox.createdAtはchange chain開始時刻を維持
- PullだけではbaseRevisionを進めない
- CREATE→DELETEでもOutboxを消さない
- Push中再編集はoutboxVersion snapshotで保護

### DELETE / CONFLICT / UNASSIGNED
- Box DELETE → child Item.boxId=UNASSIGNED
- BoxLocation DELETE → child Box.locationId=UNASSIGNED
- parent DELETE + child補正はserver 1 transaction
- reserved Box(id=UNASSIGNED) / BoxLocation(id=UNASSIGNED) を各Userで保証
- reserved entityはclient変更禁止、serverは RESERVED_ENTITY / retryable=false
- SyncConflictは `(userId, entityType, entityId)` につき未解決1 row、statusなし、解決後削除

### Pull / Full Resync
- Pull = changes[] / nextCursor / hasMore、syncSeq順
- pageのlocal適用成功後のみcursor更新
- cursor未設定の新規DBは必ずFull Resync
- Full Resyncはcurrent active canonicalのみ
- snapshot開始時にsnapshotSeq=Nと内容Nを固定
- entity type別paging、snapshot TTL約30分
- staging全完了後のみlocal canonicalへ採用
- 新規DBは初回Full Resync成功まで書込不可
- 既存canonicalありならFull Resync取得中もlocal編集可
- 既存canonicalありでFull Resync途中失敗時は旧canonicalを保持してOFFLINE_READYへ戻れる
- Full Resync採用は staging → Business/SyncState置換 → latest Outbox reapply → 必要な参照補正 → cursor=snapshotSeq を1 IndexedDB transactionで行う
- Outbox reapply順は BoxLocation → Box → Item

## 4. 現行実装との差異
- Prisma sync metadata不足
- entity idがglobal PKでuser composite identity未対応
- current Push `where:{id}` にcross-user ownership risk
- revision/contentHash/Outbox/SyncState/Conflict未実装
- Pullはtimestamp基準
- IndexedDBは固定 `hk-local-v1`
- BoxLocationモデルが確定仕様と不一致
- backupのphotoThumbs/thumbs不一致、BoxLocation不足
- Full Resync snapshot/staging未実装
- 写真photoHash未実装
- 原画像blob分離同期・オンデマンドcache未実装
- blob先行upload / entity後確定未実装
- 未参照blob 30日GC未実装

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
**原画像blobのserver側同一性・重複排除のscopeを確定する。**

候補は、同一user内でphotoHash一致blobを共有する方式と、entity/photoごとに独立blobを持つ方式。容量削減、削除/GC、権限制御、実装複雑度に影響するため次に確定する。

## 7. HLDocS運用上の注意
HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。