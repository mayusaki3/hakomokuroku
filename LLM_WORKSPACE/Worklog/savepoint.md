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

```text
createdAt
→ entity / IDが最初に生成されたbusiness時刻

updatedAt
→ business dataを実際に編集した時刻

deletedAt
→ business上の削除操作を実際に行った時刻

serverUpdatedAt
→ serverがcanonicalを更新したserver時刻
```

確定規則:
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

**確定:** client由来の `createdAt / updatedAt / deletedAt` は、timestamp形式として有効なら極端な過去・未来でもserverで補正しない。

```text
形式として不正
→ REJECTED

形式として有効
→ 過去・未来の大小だけを理由に補正・置換しない
→ business時刻として保持
```

- serverはdevice clockの正しさを推測してbusiness履歴を書き換えない
- 同期整合性・retentionはclient由来business時刻に依存しない
- UIで異常値の警告・表示補正が必要なら表示レイヤの別仕様として扱う

根拠: offline利用を前提とするためclient時刻はbusiness操作の発生時刻として価値がある。一方device clockはずれ得るので同期安全性の基準にはできない。serverが閾値で勝手に補正すると本来のbusiness履歴を失うため、形式検証のみ行い、同期制御はserver管理情報へ分離する。

### timestamp表現形式

**確定:** APIで扱うbusiness timestampはRFC 3339互換のISO 8601形式とし、timezone offsetを必須とする。server canonical保存時はUTCへ正規化する。

```text
API input/output
→ RFC 3339 / ISO 8601
→ UTC offset必須

server canonical
→ UTCへ正規化

標準精度
→ milliseconds

元のtimezone offset
→ business情報として保持しない
```

例:

```text
client: 2026-09-09T12:43:21.123+09:00
server: 2026-09-09T03:43:21.123Z
```

規則:
- offsetなしのlocal-time文字列は受理しない
- `Z` はUTC offsetとして有効
- clientがmillisecondsより細かい精度を送る場合はserver canonical保存時にmillisecondsへ正規化する
- 正規化後の瞬間が同じならtimezone offsetの違いはbusiness差分とは扱わない
- 元のoffset自体を表示・検索・監査に使う要件は現時点では持たない

根拠: 端末timezoneに依存せず同一瞬間を一意に扱え、JavaScript/JSON/Prismaとの互換性も高い。offsetをbusiness情報として保存しないことで、同一瞬間の表現差による不要な差分・conflictを防げる。

### contentHash対象範囲

**確定:** `contentHash` はbusiness上の意味的内容だけを表し、business timestamp値や同期制御メタデータは含めない。ただしactive/deleted状態は意味的差分として含める。

```text
contentHash対象外
- createdAt
- updatedAt
- deletedAt のtimestamp値
- serverUpdatedAt
- revision
- syncSeq
- contentHash自身
- userId
- entity id

contentHash対象
- business本文
- business参照関係
- 写真等のbusiness内容
- active / deleted 状態
```

規則:
- `deletedAt`の時刻値はhashへ含めない
- ただし `deletedAt == null` か否かに相当するactive/deleted状態はhashへ含める
- timestampのみ異なりbusiness内容と状態が同じ場合、同一contentHashとなる
- client clock差、server自動更新時刻差だけでCONFLICTを発生させない
- active entityとdeleted entityは必ず異なるhashになる
- canonicalizationは既定どおり、順序非依存配列はsort、object key順固定、決定的JSON化後にSHA-256相当でhash化する

根拠: `contentHash`は「意味のあるbusiness差分があるか」の判定に使うため、device clock由来timestampや同期制御値を含めると不要なCONFLICTが発生する。一方、active/deletedはbusiness上の状態差なのでhashへ含める必要がある。

### 写真とcontentHash

**確定:** Box / Itemの写真は、画像本体のbase64文字列や保存形式そのものではなく、画像内容を表す安定した`photoHash`を介してentityの`contentHash`へ含める。写真の並び順はbusiness上意味を持つものとして扱う。

```text
写真本体
→ photoHash = 正規化した画像内容から算出

Box / Item contentHash
→ business本文
→ business参照
→ 順序付きphotoHash列
→ active / deleted状態
```

規則:
- 写真データそのものやbase64表現はentity contentHashへ直接入れない
- 各写真に安定したphotoHashを持たせる
- 同じ見た目の画像を保存形式・metadata・再エンコードだけ変更した場合に、可能な限り同一photoHashとなるよう画像内容を正規化してからhash化する
- 写真配列の順番は意味的内容として扱う
- `[photoA, photoB]` と `[photoB, photoA]` は異なるbusiness内容であり、異なるentity contentHashとなる
- 先頭写真を代表画像として利用できるUI/データモデルとの整合を取る
- photoHash自体はSHA-256相当の決定的hashを使用する
- BoxLocation写真はVision対象外だが、BoxLocationに写真を保持する仕様自体は別途写真仕様で整理する

根拠: 保存形式やbase64文字列の差をbusiness差分にすると、意味的に同一の写真でも不要なCONFLICTが発生する。画像内容から安定したphotoHashを作り、それをentity hashへ取り込むことで同期判定を軽量・決定的にできる。一方、写真順は代表画像や閲覧順に影響するためbusiness内容として扱う。

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

Full Resync採用は `staging → Business/SyncState置換 → latest Outbox reapply → 必要な参照補正 → cursor=snapshotSeq` を1 IndexedDB transactionで行う。Outbox reapply順は `BoxLocation → Box → Item`。

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
- 写真の安定photoHash未実装

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
**`photoHash`算出時の画像正規化手順を確定する。**

推奨候補:
- 画像をdecodeする
- EXIF orientationを適用して表示向きを確定する
- sRGB相当の共通色空間へ変換する
- alphaを含む決定的pixel配列へ正規化する
- width / heightと正規化pixel bytesからSHA-256を算出する
- EXIF、撮影日時、GPS、ファイル名、JPEG品質、圧縮方式等のmetadataはphotoHashへ含めない

これにより見た目が同一の画像は保存形式やmetadata差に依存せず同じphotoHashになりやすく、写真同一性をbusiness内容として安定して扱える。

## 7. HLDocS運用上の注意
HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。