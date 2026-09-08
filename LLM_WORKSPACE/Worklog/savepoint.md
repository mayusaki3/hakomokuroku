# 箱目録 作業 SavePoint

更新: 2026-09-08
対象リポジトリ: `mayusaki3/hakomokuroku`
作業ブランチ: `develop`

## 1. 作業目的

箱目録を完成させる。HLDocS v0.7.0 は作業管理・仕様整理に利用するが、HLDocS自体の未完成・不整合を箱目録完成のブロッカーにしない。

## 2. 作業原則

機能単位で原則として、要件確認 → 利用者確認 → 設計 → 利用者確認 → テストケース → 利用者確認 → テストコード → 実装 → 検証の順で進める。重要な設計判断点では利用者確認を行う。仕様には判断結果だけでなく根拠も記録する。

## 3. 現在位置

**全体アーキテクチャ / データモデル / 同期設計を確定中。アプリケーションコードはまだ変更しない。**

完了済みの主要判断:
- v0.8 = Vision以外の完成版、v1.0 = v0.8 + Vision/LLM画像認識
- 登録順序 = 箱登録 → アイテム → 箱写真 → ラベル → 場所
- QR payload = Box.codeのみ、写真フィールド = `thumbs`
- Item「取り出す」= `boxId=UNASSIGNED`、Item「削除」= tombstone
- Box削除時は子ItemをUNASSIGNEDへ移動してからBoxをtombstone
- BoxLocationは独立フラットマスタ、Boxが `locationId` で参照
- BoxLocation = `id / name / note / thumbs + 共通同期メタデータ`
- BoxLocation写真はVision対象外、Vision対象はBox/Item写真
- BoxLocation.nameはユーザー内一意、trim + Unicode NFC、大小文字区別、後サーバー受理側を優先し既存側へ最小未使用 `(n)` suffix
- サーバー業務レコード識別 = `(userId,id)`、内部userIdはPrisma `User.id`
- ローカルIndexedDBはユーザー別 `hk-local-v2-<User.id>`、旧 `hk-local-v1` は移行しない
- オフライン利用はオンライン認証成功後の同一実行セッション中のみ
- 通常同期 = Pull → Push → Pull
- 初回同期中は閲覧可・書込不可、通信系失敗ならOFFLINE_READYへ遷移し書込可
- 認証/通信/同期/利用フェーズを分離して管理

## 4. 同期データモデル確定事項

### 4.1 サーバー共通同期メタデータ

Box / Item / BoxLocation:
- createdAt
- updatedAt
- deletedAt
- serverUpdatedAt
- revision
- contentHash
- syncSeq

未同期新規は revision=0 / baseRevision=0。初回サーバー登録成功で revision=1。

### 4.2 contentHash

hash対象は業務内容 + active/deleted状態。以下は除外:
- userId
- id
- createdAt / updatedAt / deletedAtの時刻値
- serverUpdatedAt
- revision
- syncSeq
- contentHash自身

削除状態はboolean相当としてhashへ含める。順序非依存配列はソートし、object key順を決定化したcanonical JSONをSHA-256等でhashする。バックアップでも同一アルゴリズムを使用する。

### 4.3 競合判定

```text
baseRevision == server.revision
→ 通常更新

baseRevision != server.revision
→ contentHash比較
  同一 → UNCHANGED相当
  不一致 → CONFLICT
```

updatedAtは勝者決定に使わない。

### 4.4 syncSeq / SyncChangeLog

- revision = レコード単位の競合判定用version
- syncSeq = DB全体で一意・単調増加する符号付き64bit変更sequence
- SyncChangeLog = Pull差分履歴の正本
- 業務レコード更新 + syncSeq採番 + SyncChangeLog追加は同一DB transaction
- Pullは認証userで絞り `syncSeq > cursor`
- SyncChangeLog保持90日、server tombstone保持30日
- cursor有効性は対象userの保持ログから判断
- stale cursor → FULL_RESYNC_REQUIRED
- syncEpochは設けない
- syncSeqを再構築する非常時は全deviceの同期を止め、cursor等を破棄してFull Resync相当で再開する

## 5. ローカル同期モデル

ローカルは以下の3層:

```text
業務テーブル
- Box
- Item
- BoxLocation
→ ユーザーに見せる現在状態

SyncState
- entityType
- entityId
- revision
- contentHash
- syncSeq
- serverUpdatedAt
- deleted
→ 最後に確認したserver基準状態

Outbox
- entityType
- entityId
- operation
- baseRevision
- contentHash
- payload
- outboxVersion
- createdAt
→ 未同期ローカル変更
```

### 5.1 Outbox

- 業務更新とOutbox更新は同一IndexedDB transaction
- Push対象はtimestampではなくOutbox
- 同一entityの未同期変更は最新状態に集約し、元のbaseRevisionを維持
- 自動期限削除しない
- 成功または明示的競合解決まで保持
- sync開始時に送信対象Outbox snapshotを固定
- device-local単調増加 `outboxVersion` を持つ
- Push成功時は `current.outboxVersion == sent.outboxVersion` の場合だけOutbox削除
- 同期中に再編集されversionが進んでいれば新しいOutboxを保持
- 先行version成功時に返ったserver revisionを後続OutboxのbaseRevisionへ安全に前進させることは可
- entityIdだけを条件にOutboxを削除しない

### 5.2 PullとOutbox overlay

概念:

```text
server/base state
+
Outbox overlay
=
user-visible current state
```

Pullでserver基準状態を取得しても、未同期ローカル編集を消さない。また競合を隠すため、PullだけでOutbox.baseRevisionを最新server revisionへ書き換えない。

適用規則:

```text
Outboxなし + UPSERT
→ 業務テーブルをserver payloadで更新
→ SyncState更新

Outboxなし + DELETE
→ 業務テーブル物理削除
→ SyncState削除

Outboxあり + UPSERT
→ server payloadを基準として反映
→ SyncState更新
→ Outbox payloadを業務テーブルへ再適用
→ Outbox保持 / baseRevision保持

Outboxあり + DELETE
→ SyncStateをserver deleted状態へ更新
→ Outbox payloadを業務テーブルへ再適用
→ Outbox保持
→ Push時に競合判定
```

server DELETE + Outboxありの場合のみdeletedなSyncStateを残す。Outboxがなくserverもdeletedなら業務テーブルとSyncStateを物理削除する。

### 5.3 ローカルDELETE

ユーザーがDELETEしたら業務テーブルから即時除去し、同期に必要な状態はSyncState + Outboxに保持する。

```text
Outbox.operation = DELETE
baseRevision = 現在の同期基準revision
contentHash = deleted状態hash
payload = null
```

Item「取り出す」はDELETEではなく `boxId=UNASSIGNED` の通常UPDATE。

### 5.4 server削除済み + local UPDATE

自動復活させない。

```text
server DELETE rev=8
local UPDATE baseRevision=6
→ revision不一致 + hash不一致
→ CONFLICT
```

競合UIではserver側=削除済み、local側=編集済みを提示。
- server優先 → 削除維持
- local優先 → 同じentity IDをactive状態へ明示的復元

local優先復元時:
- deletedAt=null
- revision=server revision+1
- new syncSeq
- active contentHash

## 6. Push API

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

バッチ全体all-or-nothingにはしない。各Outbox snapshotを論理操作単位で独立処理し、1件の競合/失敗で無関係な処理をrollbackしない。

REJECTED:
- retryable=true → Outbox保持、自動再試行可能
- retryable=false → Outbox保持、自動再送停止、利用者修正が必要

server拒否だけを理由にローカル内容/Outboxを消さない。

### 6.1 Push冪等性

persistentなprocessed-operationId表は持たない。operationIdはrequest/response相関用のみ。
冪等性は revision + contentHash + SyncConflict で成立させる。

例: 初回Push成功後response lostの場合、再送でbaseRevisionは古いがserver側hashが同一ならUNCHANGED。

### 6.2 Push依存順

create/update:

```text
BoxLocation → Box → Item
```

client側でdependency順に並べる。serverは受信operationsを順次独立処理。
依存先が利用できない場合:

```text
REJECTED
errorCode=DEPENDENCY_NOT_AVAILABLE
retryable=true
```

失敗はその依存branchだけを止め、無関係branchは継続する。

DELETEは単純な逆順ではなくserver側論理操作で参照整合性を原子的に処理:
- Box DELETE: 子ItemをUNASSIGNEDへ移動後Box tombstone
- BoxLocation DELETE: 参照BoxをUNASSIGNEDへ移動後location tombstone

## 7. SyncConflict

概念:

```text
SyncConflict
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
- 最新client候補が送られたら同じ行を更新
- 解決時にrow削除
- client勝ち = canonical更新 + revision + syncSeq + change log + conflict削除を同一transaction
- server勝ち = canonical変更せずconflict削除
- 解決時server revisionが進んでいれば既存rowのserver snapshotを最新化して再比較
- hash同一になれば自動解消、異なるなら最新client/serverを再提示
- stale snapshotでcanonicalを上書きしない
- conflicted entityも編集可能。最新local内容はOutboxに集約しoutboxVersionで同期中編集を保護

## 8. Pull API

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
- 同一entityの複数changeは初期仕様では圧縮せずsyncSeq順に返す
- 固定ページ上限を設ける（初期候補500件程度）
- cursorはresponse受信時には進めない
- ページのIndexedDB適用成功後だけnextCursorへ進める
- ページ適用 + cursor更新は可能な限り同一local transaction
- apply失敗なら旧cursor維持し同じpageを再取得可能

## 9. Full Resync

通常Pullとは別API/mode。現在activeなserver canonicalだけをsnapshotとして返し、tombstone/historyは含めない。

開始時:
- serverが対象userのactive Box/Item/BoxLocationを一時snapshot storageへcopy
- snapshotSeq取得とcopyは同じ短時間DB transaction
- 長時間transactionを保持しない

概念:

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

- row table方式で巨大JSON blobにはしない
- snapshotSeq=Nならsnapshot内容は必ずN時点を表す
- snapshot転送中のN+1以降のserver更新は許可
- local採用後cursor=Nとし、その後通常PullでN+1以降を取得

### 9.1 snapshot lifecycle

- `snapshotId` は認証user scoped
- TTL約30分
- TTL内はページ取得再開可
- expired → `FULL_RESYNC_SNAPSHOT_EXPIRED`、staging破棄して再開始
- userごとにactive snapshotは1つ。新規開始時は既存active snapshotを置換/削除
- snapshot生成失敗はtransaction rollback、snapshotIdを返さずretryable
- transfer失敗後はTTLまでsnapshotを再利用可

### 9.2 paging

Box / Item / BoxLocationをそれぞれ独立ページングするが、全ページが同一snapshotSeqに固定される。
Full Resync内部cursorはopaqueでclientは解釈しない。

clientは:

```text
boxesDone
itemsDone
locationsDone
```

を管理し、3系列すべて `hasMore=false` になるまで正式採用しない。

### 9.3 local adoption

```text
Outbox保存
↓
全snapshot pageをstagingへ取得
↓
全系列complete確認
↓
staging → canonicalをアプリ視点で原子的切替
cursor = snapshotSeq
↓
Outbox再適用
↓
Push
↓
最終Pull
```

canonical採用とcursor切替は原子的に見えること。途中のstagingはユーザーへ正本として見せない。

### 9.4 snapshot release

ローカル正式採用成功後にのみ:

```text
POST /sync/full/{snapshotId}/complete
```

を送信し、server snapshotを削除する。
complete通知失敗はFull Resync成功を取り消さない。未通知snapshotはTTLで自動回収。

根拠: local adoption前にserver snapshotを削除すると、local adoption失敗時に同snapshotで再試行できなくなるため。

## 10. バックアップ

- 通常バックアップはactiveな論理データのみ
- deletedAt != null は除外
- Outbox / SyncConflict / SyncChangeLog / cursor / revision / syncSeq等、同期内部状態は除外
- restoreされたデータは通常activeデータとして扱い同期状態は移行先で再構築
- 元IDを維持
- 同一ID + 同一contentHash = 同一データ
- 同一ID + 異なるcontentHash = import側へ新IDを発行し参照を再mapping

## 11. 状態管理

認証:
```text
LOCKED
AUTHENTICATED
```

通信:
```text
ONLINE
OFFLINE
```

同期:
```text
IDLE
SYNCING
SYNC_ERROR
CONFLICT
```

利用フェーズ:
```text
LOCKED
INITIAL_SYNC
READY
OFFLINE_READY
```

操作:
- LOCKED: 閲覧/検索/書込不可
- INITIAL_SYNC: 閲覧/検索可、書込不可
- READY: 閲覧/書込可
- OFFLINE_READY: 閲覧/書込可
- 初回以外のSYNCING/SYNC_ERROR/CONFLICTでは通常操作を継続

通信系一時障害:
- network down
- DNS failure
- timeout
- connection refused
- 一時的5xx

OFFLINE扱いにしない:
- 401/403
- validation
- consistency
- protocol/spec error
- conflict

401/403は認証再評価。

## 12. 現行実装との主要差異

- Prisma Box/Item/BoxLocationにsync metadata不足
- `updatedAt @updatedAt` は確定した業務更新時刻の意味と再確認が必要
- idがglobal PKでuser composite identity未対応
- current Pushは `where:{id}` でcross-user ID collision/所有権問題あり
- Pushにrevision/contentHash/Outbox/部分成功/Conflict未実装
- Pullはtimestamp sinceでsyncSeq/SyncChangeLog/paging未実装
- local syncはlastPushAt方式、Outbox未実装
- fixed IndexedDB `hk-local-v1` をuser別v2へ変更必要
- current BoxLocationはBox従属で確定モデルと不一致
- current Box.location自由文字列はlocationId参照へ変更必要
- current BoxLocation meta/AI項目は不要
- backupのphotoThumbs/thumbs不一致
- backupにBoxLocationなし
- backup active-only/sync-state除外方式未実装
- replace restoreがID再発行
- current Box deleteはlocal物理削除
- Full Resync snapshot/staging未実装
- SyncState分離未実装

## 13. ロードマップ

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

## 14. 次のアクション

次の設計判断点:
**local DELETE と、そのbaseRevision以降にserverでUPDATEされた同一entityが衝突した場合の扱いを確定する。**

推奨候補は自動削除せずCONFLICTとし、server優先なら更新状態を維持、local優先なら最新server revisionを基準に明示的DELETEを適用する方式。

詳細作業記録: `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`

## 15. HLDocS運用上の注意

HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
