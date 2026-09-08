# 箱目録 作業 SavePoint

更新: 2026-09-08
対象リポジトリ: `mayusaki3/hakomokuroku`
作業ブランチ: `develop`

## 1. 作業目的

箱目録を完成させる。HLDocS v0.7.0 は作業管理・仕様整理に利用するが、HLDocS自体の未完成・不整合を箱目録完成のブロッカーにしない。

## 2. 作業原則

機能単位で原則として、要件確認 → 利用者確認 → 設計 → 利用者確認 → テストケース → 利用者確認 → テストコード → 実装 → 検証の順で進める。重要な設計判断点では利用者確認を行う。仕様には判断結果だけでなく根拠も記録する。アプリケーションコードはまだ変更しない。

## 3. 現在位置

**全体アーキテクチャ / データモデル / 同期設計を確定中。**

## 4. 主要確定事項

### リリース
- v0.8 = Vision以外の完成版
- v1.0 = v0.8 + Vision/LLM画像認識
- 高度なテーマ追加開発は不要

### 登録・写真・QR
- 登録順序 = 箱登録 → アイテム → 箱写真 → ラベル → 場所
- 場所は未設定で完了可能
- 写真フィールド = `thumbs`
- QR payload = Box.codeのみ

### Box / Item / BoxLocation
- Item「取り出す」 = `boxId=UNASSIGNED` の通常UPDATE
- Item「削除する」 = DELETE/tombstone
- Box削除 = 子ItemをUNASSIGNEDへ移動後Boxをtombstone
- Box削除ではBoxLocationを削除しない
- BoxLocationは独立フラットマスタ、Boxが `locationId` で参照
- BoxLocation = `id / name / note / thumbs + 共通同期メタデータ`
- BoxLocation写真はVision対象外。Vision対象はBox/Item写真のみ
- BoxLocation.nameはユーザー内一意
- name正規化 = 前後trim + Unicode NFC、大小文字区別、内部空白等は保持
- 同名は後からserver受理した名称を優先し、既存側を最小未使用 `name(n)` へ自動改名
- suffixは名称全体へ追加し、既存末尾 `(n)` は解析しない
- Box / BoxLocationそれぞれに予約 `UNASSIGNED` を持ち、通常編集/削除不可
- BoxLocation削除 = 参照BoxをUNASSIGNEDへ移動後tombstone

## 5. サーバー同期モデル

Box / Item / BoxLocation共通:
- createdAt
- updatedAt
- deletedAt
- serverUpdatedAt
- revision
- contentHash
- syncSeq

未同期新規 = revision 0 / baseRevision 0、初回server登録成功 = revision 1。

### contentHash
- 業務内容 + active/deleted状態をhash対象
- `userId,id,createdAt,updatedAt,deletedAt時刻,serverUpdatedAt,revision,syncSeq,contentHash` は除外
- deletedAtは時刻値ではなく削除状態のみ反映
- 順序非依存配列はソート、object key順を決定化
- canonical JSON + SHA-256等
- backupも完全に同じアルゴリズムを使用

### 競合基本規則

```text
baseRevision == server.revision
→ 通常更新

baseRevision != server.revision
→ contentHash比較
  同一 → UNCHANGED
  不一致 → CONFLICT
```

updatedAtは勝者決定に使わない。

### SyncChangeLog / syncSeq
- revision = entity単位version
- syncSeq = DB全体一意・単調増加 signed 64-bit sequence
- SyncChangeLog = Pull差分履歴の正本
- record更新 + syncSeq採番 + log追加は同一transaction
- Pullは認証userで絞り `syncSeq > cursor`
- SyncChangeLog保持90日、server tombstone保持30日
- stale cursor → FULL_RESYNC_REQUIRED
- cursor有効性は対象userの保持logで判断
- syncEpochなし

## 6. ローカル同期モデル

ユーザーごとにIndexedDBを分離:
- DB名概念 = `hk-local-v2-<User.id>`
- 旧 `hk-local-v1` は移行せず無視/破棄可能
- 分離キーはPrisma内部不変ID `User.id`

3層構造:

```text
Business tables
- Box
- Item
- BoxLocation
→ user-visible working state

SyncState
- entityType
- entityId
- revision
- contentHash
- syncSeq
- serverUpdatedAt
- deleted
→ last known server baseline

Outbox
- entityType
- entityId
- operation
- baseRevision
- contentHash
- payload
- outboxVersion
- createdAt
→ unsynchronized local change
```

### Outbox
- 業務更新とOutbox更新は同一IndexedDB transaction
- PushはOutbox基準、timestamp基準ではない
- 同一entityの未同期変更は最新状態へ集約し、最初のbaseRevisionを維持
- 自動期限削除なし
- 成功/競合解決まで保持
- 同期開始時に送信対象snapshotを固定
- device-local単調増加 `outboxVersion` を持つ
- Push成功時、current outboxVersionが送信snapshotと一致する場合のみ削除
- 同期中再編集でversionが進んだ場合は新しいOutboxを保持
- entityIdだけを条件にOutbox削除禁止

### Pull + Outbox overlay

```text
server/base state + Outbox overlay = user-visible current state
```

PullだけでOutbox.baseRevisionを前進させない。そうすると本来の競合を隠すため。

適用:
- Outboxなし + UPSERT → Business更新 + SyncState更新
- Outboxなし + DELETE → Business物理削除 + SyncState削除
- Outboxあり + UPSERT → SyncStateをserver最新へ更新後、Outbox payloadをBusinessへ再適用、Outbox保持
- Outboxあり + DELETE → SyncStateをdeleted server stateへ更新後、Outboxを再適用、Outbox保持
- server deleted状態のSyncStateはOutboxがある間だけ保持し、Outboxがなくserverもdeletedなら削除

### ローカルDELETE
- user-visible Business tableから即時除去
- SyncStateは同期基準として保持
- OutboxにDELETEを登録

```text
operation=DELETE
baseRevision=current synchronized baseline revision
contentHash=deleted-state hash
payload=null
```

Item「取り出す」はDELETEではない。

## 7. Push API

Request概念:

```text
PushRequest
- operations[]
  - operationId
  - entityType
  - entityId
  - operation
  - baseRevision
  - contentHash
  - payload
```

Response概念:

```text
PushResponse
- results[]
  - operationId
  - entityType
  - entityId
  - result
  - revision
  - syncSeq
  - contentHash
  - conflictId
  - errorCode
  - retryable
```

result:
- APPLIED
- UNCHANGED
- CONFLICT
- REJECTED

- batch全体all-or-nothingにしない
- 各Outbox snapshotを論理操作単位で独立処理
- REJECTED retryable=true → Outbox保持、自動再試行可
- REJECTED retryable=false → Outbox保持、自動再送停止、利用者修正
- server拒否だけを理由にローカル内容/Outboxを消さない

### Push冪等性
- persistent processed-operationId表は持たない
- operationIdはrequest/response相関用のみ
- 冪等性は revision + contentHash + SyncConflict で成立
- response lost後の再送でserver hash同一ならUNCHANGED

### 依存順
create/update:
```text
BoxLocation → Box → Item
```

依存先利用不可:
```text
REJECTED
errorCode=DEPENDENCY_NOT_AVAILABLE
retryable=true
```

失敗は依存branchだけを止め、無関係branchは継続。
DELETEはserver側論理操作で参照整合性を原子的に処理。

## 8. SyncConflict / 競合解決

SyncConflict概念:

```text
- id
- userId
- entityType
- entityId
- clientBaseRevision
- clientContentHash
- clientPayload
- serverRevisionAtConflict
- serverContentHashAtConflict
- serverPayloadAtConflict
- createdAt
- updatedAt
```

- `(userId,entityType,entityId)` に未解決1行のみ
- statusなし
- 監査履歴ではなく一時buffer
- 同一Push再送は同じconflictId
- 最新client候補が送られた場合は同じrowを更新
- 解決後row削除
- client勝ち = canonical更新 + revision + syncSeq + SyncChangeLog + conflict削除を同一transaction
- server勝ち = canonical変更なし + conflict削除
- 解決時server revisionが進んでいれば既存rowのserver snapshotを最新化
- 最新hashが同一なら自動解消、異なるなら再提示
- stale snapshotでcanonicalを上書きしない

### server DELETE vs local UPDATE
- 自動復活させない
- revision/hash不一致ならCONFLICT
- server優先 → 削除維持
- client優先 → 同じIDをactiveへ明示的復元、deletedAt=null、revision+1、new syncSeq

### local DELETE vs newer server UPDATE
- 自動削除しない
- CONFLICT
- server優先 → DELETE取り消し、最新server activeデータ採用
- client優先 → 最新server revisionを基準に明示的DELETE、revision+1、new syncSeq、DELETE log

### local DELETE vs server DELETE
- deleted-state contentHashが同一ならUNCHANGEDとして自動解消

### 競合解決API

```text
POST /sync/conflicts/{conflictId}/resolve
```

Request:
```text
resolution = SERVER | CLIENT
outboxVersion
clientContentHash
```

Response:
```text
result = RESOLVED | CONFLICT_UPDATED | REJECTED
entityType
entityId
revision
syncSeq
contentHash
serverPayload
conflictId
errorCode
```

- 解決中にserver正本が進んでいた場合はCONFLICT_UPDATED
- 既存SyncConflict server snapshotを最新化し、古いsnapshotで解決しない

### stale client candidate
競合表示後に同じentityを再編集してOutbox versionが進んだ場合、古いCLIENT解決は適用しない。

```text
REJECTED
errorCode=STALE_CLIENT_CANDIDATE
retryable=false
```

client側でも送信前にoutboxVersion一致を確認し、server側も防御的に拒否する。

根拠: 古い競合画面からの解決で、その後のローカル編集を消失させないため。

## 9. Pull API

PullResponse:
```text
changes[]
nextCursor
hasMore
```

PullChange:
```text
syncSeq
entityType
entityId
operation = UPSERT | DELETE
revision
contentHash
payload
```

- DELETE通常payload=null
- 同一entityの複数changeは初期仕様では圧縮せずsyncSeq順
- 固定ページ上限を設ける（初期候補500程度）
- cursorはresponse受信時に進めない
- pageのIndexedDB適用成功後だけnextCursorへ進める
- page適用 + cursor更新は可能な限り同一local transaction
- apply失敗なら旧cursor維持

## 10. Full Resync

通常Pullとは別API/mode。現在activeなserver canonicalのみを固定snapshotとして返す。

Server:
```text
FullSyncSnapshot
- id
- userId
- snapshotSeq
- createdAt
- expiresAt

FullSyncSnapshotRow
- snapshotId
- entityType
- entityId
- payload
```

- snapshotSeq取得とactive Box/Item/BoxLocation copyを同じ短時間DB transactionで実行
- 長時間DB transactionを保持しない
- snapshotSeq=Nならsnapshot内容はN時点
- transfer中のN+1以降更新は許可
- local採用後cursor=N、最終PullでN+1以降取得
- row table方式、巨大JSON blobにしない
- snapshotIdはauth user scoped
- TTL約30分
- userごとにactive snapshot 1つ
- TTL切れ = FULL_RESYNC_SNAPSHOT_EXPIRED
- Box/Item/BoxLocationを独立pagingするが全page同一snapshotSeq
- Full Resync page cursorはopaque
- boxesDone/itemsDone/locationsDoneすべて完了するまで正式採用しない

Client:
```text
Outbox保持
→ 全snapshot pageをstagingへ取得
→ 全系列complete
→ stagingをcanonicalへアプリ視点で原子的採用
→ cursor=snapshotSeq
→ Outbox再適用
→ Push
→ final Pull
```

正式採用成功後だけ:
```text
POST /sync/full/{snapshotId}/complete
```

complete通知失敗はlocal成功をrollbackせず、server snapshotはTTLで回収。

## 11. 認証・オフライン・同期状態

- server 1 instance / many users
- business identity = `(User.id, entity id)`
- login用 `User.userId` と内部 `User.id` を仕様上明確に区別
- Push userIdはpayloadでなく認証から決定

オフライン:
- 起動中にオンライン認証成功したuserだけオフライン利用可
- 同じ実行session中の通信断なら継続可
- アプリ終了/再起動後は再度オンライン認証必須
- offline PIN/永続local認証なし
- unsynced data/Outboxは終了後も保持

通常同期:
```text
online auth
→ Pull
→ Outbox reapply
→ Push
→ Pull
```

状態を分離:
- Auth: LOCKED / AUTHENTICATED
- Connectivity: ONLINE / OFFLINE
- Sync: IDLE / SYNCING / SYNC_ERROR / CONFLICT
- Usage phase: LOCKED / INITIAL_SYNC / READY / OFFLINE_READY

INITIAL_SYNCは閲覧/検索可、書込不可。通信系失敗ならOFFLINE_READYへ移行し書込可。401/403・validation・consistency・protocol error・conflictはOFFLINE扱いにしない。

## 12. Backup

- activeな論理データのみ
- tombstoneを含めない
- Outbox / SyncConflict / SyncChangeLog / cursor / revision / syncSeq等の同期内部状態を含めない
- restoreは通常activeデータとして扱い同期状態を移行先で再構築
- 元ID維持
- 同一ID + 同一hash = 同一データ
- 同一ID + 異なるhash = import側で新ID発行 + 参照remap

## 13. 現行実装との主要差異

- Prisma Box/Item/BoxLocationのsync metadata不足
- `updatedAt @updatedAt` の意味が確定仕様と不一致の可能性
- entity idがglobal PKでuser composite identity未対応
- current Push `where:{id}` にcross-user ID collision/所有権リスク
- revision/contentHash/Outbox/partial Push/Conflict未実装
- Pullはtimestamp sinceでsyncSeq/SyncChangeLog/paging未実装
- local syncはlastPushAt方式、Outbox/SyncState未実装
- IndexedDB固定 `hk-local-v1` をuser別v2へ変更必要
- current BoxLocationはBox従属で確定モデルと不一致
- Box.location自由文字列をlocationIdへ変更必要
- BoxLocation meta/AI項目は不要
- backupのphotoThumbs/thumbs不一致
- backupにBoxLocationなし
- backup active-only/sync-state除外方式未実装
- replace restoreがIDを無条件再発行
- Full Resync snapshot/staging未実装

## 14. ロードマップ

0. 現状棚卸し — 完了
1. v0.8 / v1.0 要件仕様 — 主要方針確定
2. 全体アーキテクチャ確定 — **現在**
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

## 15. 次のアクション

次の設計判断点:
**serverに未登録の新規local entity（baseRevision=0）をPush前に削除した場合の扱いを確定する。**

推奨候補:
- serverが一度も認識していないentityならDELETEをPushする必要はない
- Business tableから削除し、そのentityのOutboxも削除
- SyncStateが存在しないことを確認
- IDはそのまま破棄して再利用しない

詳細作業記録: `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`

## 16. HLDocS運用上の注意

HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
