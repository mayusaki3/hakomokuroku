# 箱目録 作業 SavePoint

更新: 2026-09-08
対象リポジトリ: `mayusaki3/hakomokuroku`
作業ブランチ: `develop`

## 1. 作業目的

箱目録を完成させる。HLDocS v0.7.0 は作業管理・仕様整理に利用するが、HLDocS自体の未完成・不整合を箱目録完成のブロッカーにしない。

## 2. 作業原則

要件確認 → 利用者確認 → 設計 → 利用者確認 → テストケース → 利用者確認 → テストコード → 実装 → 検証の順で進める。重要な設計判断には根拠を記録する。現在は設計段階であり、アプリケーションコードはまだ変更しない。

## 3. 現在位置

**全体アーキテクチャ / データモデル / 同期設計を確定中。**

## 4. リリース・主要業務要件

- v0.8 = Vision以外の完成版
- v1.0 = v0.8 + Vision/LLM画像認識
- 登録順序 = 箱登録 → アイテム → 箱写真 → ラベル → 場所
- 場所は未設定で完了可能
- 写真フィールド = `thumbs`
- QR payload = Box.codeのみ
- Item「取り出す」= `boxId=UNASSIGNED` の通常UPDATE
- Item「削除」= DELETE/tombstone
- Box削除 = 子ItemをUNASSIGNEDへ移動後Boxをtombstone
- BoxLocationは独立フラットマスタ、Boxが `locationId` で参照
- BoxLocation = `id / name / note / thumbs + 共通同期メタデータ`
- BoxLocation写真はVision対象外。Vision対象はBox/Item写真
- BoxLocation.nameはuser内一意。trim + Unicode NFC、大小文字区別
- 同名は後からserver受理した名称を優先し、既存側へ最小未使用 `(n)` suffix
- Box / BoxLocationに予約 `UNASSIGNED` を持ち、通常編集/削除不可
- BoxLocation削除 = 参照BoxをUNASSIGNEDへ移動後tombstone

## 5. Server同期モデル

Box / Item / BoxLocation共通:
`createdAt, updatedAt, deletedAt, serverUpdatedAt, revision, contentHash, syncSeq`

- 未同期新規 = revision 0 / baseRevision 0
- 初回server登録成功 = revision 1
- business identity = `(User.id, entityId)`
- Pushのuser識別はpayloadではなく認証から確定
- login用 `User.userId` と内部 `User.id` を仕様上区別

### contentHash
- 業務内容 + active/deleted状態をhash対象
- userId/id/各時刻/revision/syncSeq/contentHash自身は除外
- deletedAtは時刻値ではなく削除状態だけ反映
- 順序非依存配列をsort、object key順を固定
- canonical JSON + SHA-256等
- backupでも同じalgorithmを使用

### 競合基本規則

```text
baseRevision == server.revision
→ normal update

baseRevision != server.revision
→ contentHash same → UNCHANGED
→ contentHash different → CONFLICT
```

updatedAtは勝者決定に使わない。

### syncSeq / SyncChangeLog
- revision = entity単位version
- syncSeq = DB全体一意・単調増加 signed 64-bit sequence
- SyncChangeLog = Pull差分履歴の正本
- record更新 + syncSeq採番 + log追加は同一transaction
- Pull = auth user + `syncSeq > cursor`
- SyncChangeLog保持90日
- tombstone保持30日
- stale cursor = FULL_RESYNC_REQUIRED
- syncEpochなし

## 6. Local同期モデル

IndexedDBはuserごとに分離:
- `hk-local-v2-<User.id>`
- 旧 `hk-local-v1` は移行せず無視/破棄可能

3層:

```text
Business tables
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
- Business更新とOutbox更新は同一IndexedDB transaction
- PushはOutbox基準
- 同一entityの未同期変更は最新状態へ集約し、最初のbaseRevisionを維持
- 自動期限削除なし
- sync開始時に送信snapshotを固定
- device-local単調増加 `outboxVersion`
- Push成功時、current version == sent version の場合だけOutbox削除
- 同期中再編集でversionが進んだら新Outboxを保持
- entityIdだけを条件にOutbox削除禁止

### Pull + Outbox overlay

```text
server/base state + Outbox overlay = user-visible current state
```

PullだけでOutbox.baseRevisionを前進させない。

- Outboxなし + UPSERT → Business更新 + SyncState更新
- Outboxなし + DELETE → Business物理削除 + SyncState削除
- Outboxあり + UPSERT → SyncStateをserver最新へ更新後、Outbox payloadをBusinessへ再適用
- Outboxあり + DELETE → SyncStateをserver deleted状態へ更新後、Outboxを再適用
- server deleted SyncStateはOutboxがある間だけ保持

### Local DELETE
- Business tableから即時除去
- SyncStateは同期基準として保持
- OutboxをDELETEへ更新

```text
operation=DELETE
baseRevision=current synchronized baseline revision
contentHash=deleted-state hash
payload=null
```

Item「取り出す」はDELETEではない。

### 未同期新規entityのDELETE
**例外最適化を行わず、未同期新規も常にDELETEをOutboxへ載せる。**

```text
local CREATE/UPDATE
baseRevision=0
↓ user DELETE
Businessから即時除去
OutboxをDELETEへ置換
baseRevision=0
payload=null
↓ Push
```

server側:
- 同一IDが存在しない → UNCHANGED
- 同一IDが存在する → 通常のrevision/contentHash/競合規則で処理

CREATE送信済みだがresponse lostのケースも同じDELETE経路で安全に吸収する。`hasBeenPushed` 等の追加状態は持たない。IDは再利用しない。

根拠: DELETE経路を一本化でき、未送信・送信結果不明を区別する追加stateが不要になるため。

## 7. Push API

Request:
```text
operations[] {
  operationId,
  entityType,
  entityId,
  operation,
  baseRevision,
  contentHash,
  payload
}
```

Response per operation:
```text
operationId
entityType
entityId
result = APPLIED | UNCHANGED | CONFLICT | REJECTED
revision
syncSeq
contentHash
conflictId
errorCode
retryable
```

- batch全体はall-or-nothingにしない
- 各Outbox snapshotを論理操作単位で独立処理
- REJECTED retryable=true → Outbox保持、自動再試行可
- REJECTED retryable=false → Outbox保持、自動再送停止
- server拒否だけを理由にlocal内容/Outboxを消さない
- operationIdは相関用のみ。persistent processed-operationId表は持たない
- idempotencyは revision + contentHash + SyncConflict で成立

create/update依存順:
```text
BoxLocation → Box → Item
```

依存不可:
```text
REJECTED
errorCode=DEPENDENCY_NOT_AVAILABLE
retryable=true
```

失敗は依存branchだけを止め、無関係branchは継続。

## 8. SyncConflict / 競合解決

- `(userId,entityType,entityId)` に未解決1row
- statusなし
- 一時bufferであり監査履歴ではない
- 同一Push再送は同じconflictId
- 最新client候補は同rowへ更新
- 解決後row削除
- client勝ち = canonical更新 + revision + syncSeq + SyncChangeLog + conflict削除を同一transaction
- server勝ち = canonical変更なし + conflict削除
- 解決時server revisionが進んでいればserver snapshotを最新化
- hash同一なら自動解消、異なるなら最新内容を再提示

競合規則:
- server DELETE vs local UPDATE → CONFLICT、自動復活禁止。client勝ちのみ同IDをactiveへ復元
- local DELETE vs newer server UPDATE → CONFLICT、自動削除禁止
- local DELETE vs server DELETE → deleted-state hash同一ならUNCHANGED

Resolve API:
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

- server正本がさらに進んでいればCONFLICT_UPDATED
- stale snapshotで解決しない
- outboxVersion不一致の古いCLIENT解決は拒否:

```text
REJECTED
errorCode=STALE_CLIENT_CANDIDATE
retryable=false
```

## 9. Pull API

```text
PullResponse
- changes[]
- nextCursor
- hasMore

PullChange
- syncSeq
- entityType
- entityId
- operation = UPSERT | DELETE
- revision
- contentHash
- payload
```

- DELETE通常payload=null
- 同一entityの複数changeは圧縮せずsyncSeq順
- 固定page上限（初期候補500程度）
- cursorはresponse受信時には進めない
- pageのIndexedDB適用成功後だけnextCursorへ進める
- page適用 + cursor更新は可能な限り同一local transaction

## 10. Full Resync

通常Pullとは別API/mode。現在activeなserver canonicalのみを固定snapshotとして返す。

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

- snapshotSeq取得とactive rows copyは同じ短時間DB transaction
- 長時間transactionを保持しない
- snapshotSeq=Nなら内容はN時点
- transfer中のN+1以降更新は許可
- Box/Item/BoxLocationを独立paging、全page同一snapshotSeq
- page cursorはopaque
- TTL約30分
- userごとにactive snapshot 1つ
- TTL切れ = FULL_RESYNC_SNAPSHOT_EXPIRED

Client:
```text
Outbox保持
→ snapshotをstagingへ全取得
→ boxes/items/locations全系列complete
→ stagingをcanonicalへ原子的採用
→ cursor=snapshotSeq
→ Outbox再適用
→ Push
→ final Pull
```

正式採用成功後だけ:
```text
POST /sync/full/{snapshotId}/complete
```

通知失敗はlocal成功をrollbackせず、server snapshotはTTLで回収。

## 11. 認証・オフライン・状態管理

- オフライン利用は、その起動中にオンライン認証成功したuserのみ
- 同じ実行session中の通信断なら継続可能
- app終了/再起動後は再度online auth必須
- offline PIN/永続local認証なし
- unsynced data/Outboxは保持

通常同期:
```text
online auth → Pull → Outbox reapply → Push → Pull
```

状態:
- Auth: LOCKED / AUTHENTICATED
- Connectivity: ONLINE / OFFLINE
- Sync: IDLE / SYNCING / SYNC_ERROR / CONFLICT
- Usage: LOCKED / INITIAL_SYNC / READY / OFFLINE_READY

INITIAL_SYNCは閲覧/検索可、書込不可。通信系失敗ならOFFLINE_READYへ移行して書込可。401/403・validation・consistency・protocol error・conflictはOFFLINE扱いにしない。

## 12. Backup

- activeな論理データのみ
- tombstoneなし
- Outbox / SyncConflict / SyncChangeLog / cursor / revision / syncSeq等を含めない
- restoreは通常activeデータとして扱い、同期状態を移行先で再構築
- 元ID維持
- 同一ID + 同一hash = 同一データ
- 同一ID + 異なるhash = import側で新ID発行 + 参照remap

## 13. 現行実装との主要差異

- Prisma sync metadata不足
- entity idがglobal PKでuser composite identity未対応
- current Push `where:{id}` にcross-user ID collision/所有権リスク
- revision/contentHash/Outbox/partial Push/Conflict未実装
- Pullはtimestamp sinceでsyncSeq/SyncChangeLog/paging未実装
- local syncはlastPushAt方式、Outbox/SyncState未実装
- IndexedDB固定 `hk-local-v1` をuser別v2へ変更必要
- current BoxLocationはBox従属で確定モデルと不一致
- Box.location自由文字列をlocationIdへ変更必要
- backupのphotoThumbs/thumbs不一致、BoxLocation不足
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
**baseRevision=0 のCREATE/UPDATEが、同じIDのserver既存entityと衝突した場合の扱いを確定する。**

既決方針では、同一authenticated user scope内で新規IDがserverに既に存在する場合はID collisionであり、通常上書きしない。次に、そのAPI結果とlocal recovery方法を確定する。

詳細作業記録: `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`

## 16. HLDocS運用上の注意

HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
