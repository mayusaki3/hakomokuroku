[目次](../README.md) > アーキテクチャ > Backup / Restore設計

# Backup / Restore設計

## 1. Backup
v0.8はmanual foreground exportのみ。self-contained `.hkmbackup` ZIPを生成する。

```text
manifest.json
checksums.json
photos/<photoId>.webp
thumbnails/<photoId>.webp
```

Business snapshotはexport開始時のlocal Business view。未同期Businessも含めるが、SyncState/Outbox/device namespace/restore temporary stateは含めない。

backupは同一UserへのRestoreのみ許可する。application-level encryptionはv0.8対象外。

## 2. Integrity
manifest/schema/path safety/duplicate entry/checksum/entity reference/photo referenceを検証する。checksumsは破損検出用で真正性保証ではない。

## 3. Restore operation
Restoreはonlineの単一operation。
- operation開始時にserver User-scoped Restore lockを取得
- long-term pause/resumeなし
- RestoreHistoryなし
- persistent RestoreConflictなし
- full backup binary stagingなし
- backup fileをoperation sourceとして直接読む
- conflict resolutionはmemory上
- same business content = UNCHANGED
- differing content = KEEP_EXISTING / USE_BACKUP
- currentにidentity無し = validation後auto-add candidate

## 4. Restore lock
User scopeで1つのlockをserverが管理する。

### 4.1 Lease
- lease duration: **60秒**
- renew interval: **20秒**
- opaque `lockToken`
- expiry判定はserver clockを正とする
- renew成功時はそのserver処理時点から60秒へ延長
- operation中だけrenewし、backgroundで無期限維持しない
- handoff / transparent reacquire / resolution reuseは行わない

owner以外のBusiness Sync/blob uploadは `RESTORE_LOCKED`。local編集は可能。

### 4.2 API
概念API:
```text
POST /restore/lock
POST /restore/lock/renew
DELETE /restore/lock
```

取得成功:
```text
lockToken
expiresAt
```

renew:
- authenticated UserとlockTokenがcurrent ownerに一致する場合のみ成功
- 成功時は新しい `expiresAt` を返す
- expired / token mismatch / ownership mismatchはrenew失敗

release:
- ownerのみ明示release可能
- operation完了/cancel時は明示releaseを試みる
- release requestが失敗してもlease expiryで解放される

### 4.3 Failure
- server apply request送信前にrenew/ownershipを失った場合: 即abortしmemory上resolutionを破棄
- server apply request送信後に通信/renewが不明になった場合: local判断で再applyせず、`applyId` でRestoreApplyResultを照会
- active lockが存在する状態で別Restore開始要求: retryable `RESTORE_LOCKED`
- lock expiry自体はBusiness rollbackを意味しない

## 5. Apply authority / order
Restoreは**server-first**とし、server canonical stateを唯一のRestore commit authorityとする。

```text
1. Restore lock取得
2. backup検証
3. current server Businessと比較
4. conflict resolution / final summary
5. USE_BACKUP / auto-addに必要なphoto binaryをserverへupload・検証
6. clientでunique applyId生成・RestoreApplyMarkerへ永続化
7. lockToken + applyId + final apply planでserver Restore apply
8. server atomic transaction commit
9. RestoreApplyResult(COMMITTED)を確認
10. clientはserver canonical stateをPull/adopt
11. RestoreApplyMarker削除
12. Restore lock解放
```

Restore専用のlocal Business/Outbox commitは行わない。Restore結果はserver commit後のPullでlocalへ反映する。

これによりserver commit前にlocalだけRestore済みになる状態を作らず、response loss/crash時もapplyIdからserver commit有無を判定できる。

## 6. Binary
backup採用/new entityで必要なphoto binaryはserver apply前にserverへuploadし、photoId/hash/size/formatを検証する。

全必要binaryがserver-readyになるまでBusiness applyを開始しない。

server apply未commitのuploadはunreferenced blobとして通常orphan GC対象にできる。Restore correctnessのためのlocal pre-promotionは不要。

## 7. Idempotency / Server transaction
server Restore applyはclient-generated unique `applyId` を使う。同一User+applyIdを二重Business applyしない。

server atomic transactionには以下を含める。
- Restore Business changes
- canonical metadata / revision / contentHash / serverUpdatedAt / syncSeq
- SyncChangeLog
- short-lived `RestoreApplyResult(COMMITTED)`

persistent Restore Jobは持たない。

response loss時は同じapplyIdでresultを照会する。
- COMMITTED → 再applyせずlocal Pull/adoptへ進む
- resultなし + lock有効 → 同じapplyId/requestで安全にretry可能
- resultなし + lock失効 → 未commitとしてoperation終了。古いresolutionから自動再開しない

same applyIdに異なるrequest contentを送信した場合はvalidation errorとする。

### 7.1 RestoreApplyResult retention
`RestoreApplyResult(COMMITTED)` はcommit時点から **7日間** 保持する。

目的はresponse loss / client crash後のidempotency・commit判定だけであり、Restore履歴やaudit用途には使用しない。

- retention起点はserver commit時刻
- 7日経過後はphysical deletion可能
- cleanup遅延に依存した動作は禁止し、7日経過後は存在を保証しない
- clientは通常COMMITTED確認・Pull/adopt完了後にmarkerを削除する
- 7日を超えて古いlocal `RestoreApplyMarker` が残り、resultが存在しない場合は**自動再applyしない**
- その場合markerをcleanupし、通常syncでserver canonical stateへ収束する
- RestoreApplyResult削除はBusiness / SyncChangeLog / photo referenceを変更しない

## 8. Client crash safety
minimal durable markerは以下。

```text
RestoreApplyMarker
- applyId
```

markerはserver request前に保存する。

startup/recovery:
- markerなし → pending Restore applyなし
- markerあり → server `RestoreApplyResult` をapplyIdで照会
- COMMITTED → server canonical stateをPull/adoptしmarker削除
- resultなし → local BusinessはRestore適用されていないため再applyしない。markerをcleanupし通常状態へ戻る

`promotedPhotoIds[]` と `appliedAt` は不要。local Restore-specific Outboxも作らない。

## 9. Local convergence
server COMMITTED後のlocal反映は通常Pullのcanonical payloadを使用する。

Restore owner端末ではRestore operation中の通常Business編集を禁止しているため、Restore自身のlocal Outboxとのmergeは発生しない。

他端末はlock中もlocal編集可能。unlock後に通常
```text
Pull → Outbox reapply → required blob upload → Push → Pull
```
で収束し、必要なら通常SyncConflictとなる。Restore専用conflict typeは作らない。

## 10. Restore UI flow
Restoreは長期再開を持たない1回のforeground flowとする。

```text
ファイル選択
  ↓
Restore lock取得
  ↓
backup検証 / current server Business比較
  ↓
差分summary
  ↓
競合があれば1件ずつ KEEP_EXISTING / USE_BACKUP
  ↓
最終summary
  ↓
[復元を実行]
  ↓
必要photo upload / validation
  ↓
server apply
  ↓
COMMITTED確認
  ↓
local Pull/adopt
  ↓
完了
```

### 10.1 ファイル選択
- online/authenticatedでなければRestore開始不可
- file選択後、最初にRestore lockを取得する
- lock取得失敗時はbackup解析を開始せず `RESTORE_LOCKED` を表示
- backup owner/schema/integrity validation failureは適用前に終了

### 10.2 差分・競合
差分summaryではentity type別に少なくとも以下の件数を表示する。
- auto-add
- USE_BACKUP候補
- KEEP_EXISTING候補
- UNCHANGED

business contentが異なるidentityだけ利用者判断を要求する。
各競合ではcurrentとbackupを比較し、`現在を保持` / `バックアップを使用` を選択する。

全競合が解決するまで最終実行へ進めない。

### 10.3 最終summary
利用者の明示操作 `復元を実行` を必須とする。
summaryには最終的な追加・backup採用・現在維持・変更なし件数を表示する。

この操作まではCancel可能。Cancel時はmemory上resolutionを破棄しlockをreleaseする。次回はfile選択からやり直す。

### 10.4 Apply中
`復元を実行` 後は通常Cancelを提供しない。

進行表示は内部state machineの永続化を意味せず、少なくとも以下を区別する。
- 写真を準備中
- サーバーへ復元中
- 復元結果を確認中
- この端末へ反映中

server apply request送信後に通信が切れた場合は失敗と断定せず `復元結果を確認中` とし、applyIdでRestoreApplyResultを照会する。

### 10.5 完了
COMMITTED確認後、local Pull/adopt完了をもってowner端末のUIを `復元完了` とする。

完了画面には追加/更新/維持/変更なしのsummaryを表示可能だが、RestoreHistoryとして永続保存しない。

### 10.6 Error
- apply前のvalidation/lock/network failure: Restore未適用として終了し、再実行はfile選択から
- apply後のCOMMITTED: error表示に戻さずlocal convergenceを続行
- apply後にresultなし + lock失効: 未commitとして終了
- local Pull/adopt failure after COMMITTED: server Restoreは成功済み。UIは `復元済み・この端末への反映待ち` とし、通常syncで再取得する
- error/cancelで過去resolutionを再利用しない

## 11. 設計残件
Restore固有の主要設計残件はなし。通常Data Model / Sync / Photo / UI共通仕様の確定内容に従う。

旧persistent RestoreSession / RestoreHistory / persistent RestoreConflict / full binary staging / restore storage accounting / long-term resume / local-first Restore applyは現行仕様ではない。

[目次](../README.md) > アーキテクチャ > Backup / Restore設計
