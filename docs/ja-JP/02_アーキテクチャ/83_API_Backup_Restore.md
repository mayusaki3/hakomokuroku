[目次](../目次.md) > アーキテクチャ > API設計 > Backup / Restore API

# Backup / Restore API

## 1. 目的

`.hkmbackup` の作成とRestore（リストア）に必要なserver APIを定義する。

データ範囲、競合原則、Restore lock、applyIdは [バックアップ / リカバリモデル](./60_バックアップ_リカバリモデル.md) を参照。

## 2. BackupとRestoreの責務分離

Backupファイルはclientで生成する。

理由:

- server canonicalだけでなくlocal未同期Businessも含める。
- local保存中の写真binaryも含める。
- DeviceState / SyncState / Outboxそのものは含めない。

serverに「現在のserver DBだけをbackupとしてdownloadするAPI」はv0.8では必須としない。

Restoreはserver canonicalとの整合が必要なためserver-firstで処理する。

## 3. Backupファイル

```text
schema: hakomokuroku-backup
version: 1
extension: .hkmbackup
container: ZIP
```

clientは作成前にlocal Businessへ現在のOutbox内容が反映された状態を使用する。

Backupに含める:

- Box
- Item
- BoxLocation
- 参照されるcanonical photo originals
- User一致確認に必要な識別情報

含めない:

- Device / DevicePrefix
- DeviceState / LocalSequence
- SyncState
- Outbox
- SyncConflict
- Restore制御状態

## 4. Restore全体フロー

```text
local backup validation
        ↓
Restore lock取得
        ↓
serverへbackup manifest / Business / photo staging
        ↓
server validation
        ↓
Restore plan作成
        ↓
必要なら利用者が競合解決
        ↓
applyId付きapply
        ↓
COMMITTED
        ↓
lock release
        ↓
Pull / Full Resync
        ↓
local canonical採用
```

## 5. Restore lock取得

### POST /api/restore/lock

login必須。

成功:

```json
{
  "ok": true,
  "lockToken": "<opaque token>",
  "expiresAt": "<RFC3339>"
}
```

lock有効時間は60秒。

同一Userに有効なRestore lockがある場合:

```text
409 restore_locked
```

raw lockTokenはresponseでclientへ一度返す。

server DBにはtoken hashだけを保存する。

## 6. Restore lock renew

### POST /api/restore/lock/renew

request:

```json
{
  "lockToken": "string"
}
```

有効なlockをserver clock基準で60秒へ延長する。

clientは20秒間隔を目安にrenewする。

成功:

```json
{
  "ok": true,
  "expiresAt": "<RFC3339>"
}
```

失効済みlockはrenewできない。

## 7. Restore lock release

### DELETE /api/restore/lock

requestはlockTokenを認証情報として渡す。

releaseは冪等とする。

COMMITTED後はclientが明示releaseする。

通信断等でreleaseされなくても60秒で失効する。

## 8. Restore staging

Restore対象Businessと写真binaryはapply前のstagingへ送る。

staging dataはcanonical Businessとして公開しない。

概念API:

```text
POST /api/restore/staging
PUT  /api/restore/staging/{stagingId}/photos/{photoId}
POST /api/restore/staging/{stagingId}/complete
```

すべて有効なlockTokenを要求する。

### 8.1 staging作成

requestはbackup schema/version、User識別情報、Business manifest等を持つ。

serverは少なくとも次を検証する。

- schema = hakomokuroku-backup
- version = 1
- authenticated Userとbackup Userの一致
- Business schema
- Box.code canonical形式
- ID / code重複
- reference整合
- Box nesting self-reference / cycle

不正backupを自動修復しない。

### 8.2 写真staging

写真はphotoHashを検証する。

Restoreに必要な写真がserverで既に同一User / photoId / photoHashとしてREADYなら再uploadを省略できる。

同一photoIdに異なるphotoHashがある場合は競合として扱う。

## 9. Restore plan

### POST /api/restore/staging/{stagingId}/plan

server canonicalとstaging Businessを比較し、適用候補を作成する。

response概念形式:

```json
{
  "ok": true,
  "planId": "string",
  "baseSyncSeq": 123,
  "conflicts": []
}
```

自動決定できない競合は `conflicts` に含める。

例:

- 同一Box.idでBox.codeが異なる。
- 異なるBox.idでBox.codeが重複する。
- current serverとの組合せでBox nesting cycleになる。
- 参照先選択によってBusiness上の意味が変わる。

## 10. 競合解決

競合がある場合、clientは利用者の選択をplanへ送る。

### POST /api/restore/staging/{stagingId}/plan/{planId}/resolve

requestはconflictごとの選択を持つ。

serverは選択後のgraph全体を再validationする。

cycle等の不正状態を強制適用する選択は受理しない。

## 11. Restore apply

### POST /api/restore/staging/{stagingId}/apply

request:

```json
{
  "lockToken": "string",
  "planId": "string",
  "applyId": "string"
}
```

apply直前に少なくとも次を再確認する。

- lockが有効
- stagingがcomplete
- planが最終状態
- current server stateがplan作成時から不正に変化していない
- Business graph invariant
- 必要な写真binaryがREADY
- applyIdの冪等性

## 12. apply transaction

Restore applyはserver transactionで実行する。

同一transaction内で少なくとも次を確定する。

- Business canonical変更
- revision更新
- contentHash更新
- syncSeq採番
- SyncChangeLog
- RestoreApplyResult = COMMITTED

途中失敗時にBusinessだけが部分commitされた状態を残さない。

## 13. applyId

applyIdはclient生成。

identity:

```text
(User.id, applyId)
```

同じapplyId / 同じrequestDigest:

- 二重適用しない。
- 既存RestoreApplyResultを返す。

同じapplyId / 異なるrequestDigest:

```text
409 apply_id_conflict
```

COMMITTED RestoreApplyResultは7日保持する。

## 14. Apply response

成功:

```json
{
  "ok": true,
  "status": "COMMITTED",
  "applyId": "string",
  "syncSeq": 456
}
```

clientはこのresponseだけを根拠にlocal Businessをbackup内容へ直接置換しない。

COMMITTED後、server canonicalをPullまたはFull Resyncして採用する。

## 15. Server state変化

Restore lock中は同一Userに対するRestore対象Businessの通常Pushを受理しない。

Device register / DevicePrefix allocationも一時停止する。

apply前にserver stateがplanの前提と一致しない場合:

```text
409 restore_plan_stale
```

clientはcurrent stateを再取得してplanを作り直す。

## 16. Lock失効

lock失効後:

- plan作成不可
- conflict resolve不可
- apply不可

response:

```text
409 restore_lock_expired
```

staging dataは直ちにcanonicalへ昇格しない。

不要stagingはserver GC対象とする。

## 17. Restore後のDevice

BackupからDeviceStateを復元しない。

新しい端末の場合、Restore完了後に通常のDevice setupを行う。

- new deviceId
- new DevicePrefix
- LocalSequence = 0

既存Box.codeは変更しない。

Device APIは [Box.code（箱コード）/ Device（デバイス）設計](./70_BoxCode_Device設計.md) を参照。

## 18. Error mapping

| HTTP | error | 意味 |
| --- | --- | --- |
| 400 | invalid_request | request / backup形式不正 |
| 401 | unauthorized | 未認証 |
| 409 | restore_locked | 他のRestoreが実行中 |
| 409 | restore_lock_expired | lock失効 |
| 409 | restore_conflict | 利用者確認が必要な競合 |
| 409 | restore_plan_stale | plan作成後に前提stateが変化 |
| 409 | apply_id_conflict | 同一applyIdでrequestDigest不一致 |
| 422 | invalid_backup | backup内容がschema / invariant違反 |
| 500 | internal_error | server内部エラー |

## 19. Security

- authenticated Userとbackup Userが一致しなければRestoreしない。
- lockTokenは十分なentropyを持つopaque tokenとする。
- raw lockTokenをDBへ保存しない。
- ZIP entry pathをそのままfilesystem pathへ使用しない。
- ZIP展開時にpath traversalを拒否する。
- 展開後size、entry数、写真sizeに上限を設ける。
- backup内binaryのphotoHashを再計算する。

## 20. 現行実装との差分

現行コードにv0.8 Backup / Restore APIは存在しない。

現在の `settings/backup` 画面は旧同期endpoint / token / Push / Pull設定画面であり、v0.8のBackup / Restore機能ではない。

実装工程で本書に従ってBackup UIとRestore APIへ再構成する。

[目次](../目次.md) > アーキテクチャ > API設計 > Backup / Restore API
