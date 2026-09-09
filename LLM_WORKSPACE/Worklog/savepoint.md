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

`createdAt / updatedAt / deletedAt` はbusiness上の時刻、`serverUpdatedAt` はserver canonical更新時刻として責務を分離する。

- 新規CREATE（baseRevision=0）はclient.createdAtを採用
- 既存entityのUPDATE/復活ではcanonicalのcreatedAtを維持し、client値で上書きしない
- reserved / server自動生成entityのcreatedAtはserver時刻
- client編集のupdatedAtはPush受理時にserver時刻で上書きしない
- server自身がcascade・自動rename・参照補正等でbusiness変更した場合、そのserver操作時刻をupdatedAtとする
- client DELETEのdeletedAtはclient削除時刻を保持
- server自身がDELETE主体の場合はserver操作時刻をdeletedAtとする
- DELETE後に同一IDを復活させてもcreatedAtは元値を維持、updatedAtは復活操作時刻、deletedAt=null
- createdAt / updatedAt / deletedAt は競合勝者判定、Pull順序、cursor判定に使用しない
- 同期整合性は revision / contentHash / syncSeq を基準とする

### client由来business時刻の異常値

**確定:** client由来の `createdAt / updatedAt / deletedAt` は、timestamp形式として有効なら極端な過去・未来でもserverで補正しない。形式不正のみREJECTEDとする。同期整合性・retentionはclient由来business時刻に依存しない。

根拠: offline利用ではclient時刻はbusiness操作の発生時刻として価値がある一方、device clockはずれ得る。serverが推測でbusiness履歴を書き換えず、同期安全性はserver管理情報へ分離する。

### timestamp表現形式

**確定:** APIのbusiness timestampはRFC 3339互換ISO 8601、timezone offset必須。server canonical保存時はUTCへ正規化し、標準精度はmilliseconds。元offsetは保持しない。

- offsetなしlocal-timeは受理しない
- `Z`は有効
- millisecondsより細かい精度はserver canonical保存時にmillisecondsへ正規化

### contentHash対象範囲

**確定:** `contentHash` はbusiness上の意味的内容だけを表し、business timestamp値や同期制御メタデータは含めない。ただしactive/deleted状態は含める。

対象外: `createdAt`, `updatedAt`, `deletedAt`時刻値, `serverUpdatedAt`, `revision`, `syncSeq`, `contentHash`, `userId`, entity id。
対象: business本文、business参照、写真等のbusiness内容、active/deleted状態。

canonicalizationは、順序非依存配列はsort、object key順固定、決定的JSON化後にSHA-256相当でhash化する。

### 写真とcontentHash

**確定:** Box / Itemの写真は`photoHash`を介してentityの`contentHash`へ含め、写真配列の順番もbusiness内容として扱う。ただし画像内容の高度な正規化は行わない。

```text
保存された写真データ
→ photoHash = 保存データから決定的に算出

Box / Item contentHash
→ business本文
→ business参照
→ 順序付きphotoHash列
→ active / deleted状態
```

規則:
- 写真データそのものをentity contentHashへ直接入れず、各写真のphotoHashを使用する
- photoHashはSHA-256相当の決定的hashとする
- EXIF除去、pixel展開、色空間統一、再エンコード同一視等の高度な画像正規化は要件としない
- 利用者が写真を変換・再保存・再エンコードして保存内容が変化した場合、それは写真の更新として扱ってよい
- 同じ見た目でも保存データが異なれば別photoHashとなり得る
- `[photoA, photoB]` と `[photoB, photoA]` は異なるbusiness内容とする
- 先頭写真を代表画像として利用できるUI/データモデルとの整合を取る
- BoxLocation写真も同じ写真同一性ルールを適用できるが、Vision対象はBox/Item写真のみ

根拠: 箱目録では利用者が明示的に写真を変換・再保存した場合、それを最新の写真変更として扱えば十分である。見た目が同一かを判定するためのdecode・EXIF orientation・色空間・pixel正規化は実装とテストを複雑化する割に必要性が低い。保存された写真データをそのまま変更単位とする方が仕様が単純で予測可能。

### 写真同期payload

**確定:** 原画像はentity JSONへ埋め込まず、写真blobとしてentity同期とは分離して転送する。一方、サムネイルはentity JSONへ埋め込む。

概念:

```text
entity JSON
- photoId / blob参照
- photoHash
- thumbnail
- 写真順序

写真本体
- blobとして別転送
```

規則:
- 原画像blobはPush/Pull/Full Resyncの通常entity JSONから分離する
- entity側は写真参照、`photoHash`、順序、サムネイルを保持する
- サムネイルはJSONへ埋め込み、一覧・検索結果・オフライン表示で原画像取得を不要にする
- `contentHash`は順序付き`photoHash`列を使用し、サムネイルのbase64表現自体はhashへ直接含めない
- 原画像の同期失敗とentity metadata同期は区別して扱える設計とする
- Outboxで同じ原画像blobをentity payloadごとに複製しない
- Full Resyncのcanonical entity取得でもサムネイルは同時取得でき、原画像は必要に応じて別取得できる構造を採る

根拠: 原画像をJSONへ埋め込むとPush/Pull/Full Resyncのpayloadが大きくなり、同じ写真の重複保持や再送コストが増える。一方サムネイルは軽量で、JSONに含めることで一覧やオフライン閲覧が単純になる。原画像だけ別blobに分離する構成が容量と利用性のバランスがよい。

### deletedAt / tombstone保持起算
- tombstoneはDELETEをcanonicalへ受理したserver管理時刻 + 30日後に物理削除可能
- `deletedAt`そのものはpurge起算に使用しない
- deleted状態のentityではDELETE受理時の`serverUpdatedAt`をpurge起算として利用できる
- 復活時はdeletedAt=nullとなりpurge対象外
- SyncChangeLogは固定90日保持、device cursorでは延長しない
- Pullに必要なlogが欠落済み、または完全性を保証できない場合は `FULL_RESYNC_REQUIRED`

### Outbox
Outboxは履歴ではなくlatest unsynced candidate。同一 `(entityType, entityId)` につき1 row。

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
- reserved `Box(id=UNASSIGNED)` / `BoxLocation(id=UNASSIGNED)` を各Userで保証
- reserved entityはclient変更禁止、serverは `RESERVED_ENTITY / retryable=false`
- SyncConflictは `(userId, entityType, entityId)` につき未解決1 row、statusなし、解決後削除

### Pull / Full Resync
- Pull = `changes[] / nextCursor / hasMore`、syncSeq順
- pageのlocal適用成功後のみcursor更新
- cursor未設定の新規DBは必ずFull Resync
- Full Resyncはcurrent active canonicalのみ
- snapshot開始時にsnapshotSeq=Nと内容Nを固定
- entity type別paging、snapshot TTL約30分
- staging全完了後のみlocal canonicalへ採用
- 新規DBは初回Full Resync成功まで書込不可
- 既存canonicalありならFull Resync取得中もlocal編集可
- 既存canonicalありでFull Resync途中失敗時は旧canonicalを保持してOFFLINE_READYへ戻れる
- Full Resync採用は `staging → Business/SyncState置換 → latest Outbox reapply → 必要な参照補正 → cursor=snapshotSeq` を1 IndexedDB transactionで行う
- Outbox reapply順は `BoxLocation → Box → Item`

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
- 原画像blob分離同期未実装

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
**原画像blobの取得方針を確定する。**

候補は、Full Resyncや通常Pull時に全原画像を自動取得する方式と、サムネイル/metadataだけ同期して原画像は必要時または明示操作時に取得する方式。容量・通信量・オフライン要件に影響するため次に確定する。

## 7. HLDocS運用上の注意
HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。