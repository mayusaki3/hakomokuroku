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

## 3. リリース・業務の主要確定事項

- v0.8 = Vision以外の完成版
- v1.0 = v0.8 + Vision/LLM画像認識
- 登録順序 = 箱登録 → アイテム → 箱写真 → ラベル → 場所
- 写真フィールド = `thumbs`
- QR payload = Box.codeのみ
- Item「取り出す」= `boxId=UNASSIGNED` の通常UPDATE
- Item「削除」= DELETE/tombstone
- Box削除 = 子ItemをUNASSIGNEDへ移動後Boxをtombstone
- BoxLocationは独立フラットマスタ。Boxが `locationId` を参照
- BoxLocation = `id / name / note / thumbs + 共通同期メタデータ`
- BoxLocation.nameはuser内unique。later server-accepted nameが勝ち、旧recordへ最小未使用 `(n)` suffix
- name正規化 = trim + Unicode NFC、case-sensitive。末尾`(n)`を特別解釈しない
- Vision対象はBox/Item写真のみ
- Box / BoxLocationに予約 `UNASSIGNED`

## 4. Server同期

Box / Item / BoxLocation共通同期メタデータ:
`createdAt, updatedAt, deletedAt, serverUpdatedAt, revision, contentHash, syncSeq`

- business identity = `(User.id, entityId)`
- PushのuserIdは認証から確定し、payloadを信用しない
- 未同期新規 = revision 0 / baseRevision 0
- 初回server登録成功 = revision 1
- revision不一致時はcontentHash比較。同一ならUNCHANGED、異なればCONFLICT
- updatedAtで勝者を決めない
- contentHash = 業務内容 + active/deleted状態。時刻、revision、syncSeq等は除外
- order-insensitive arrayはsort、object keyは決定的順序、SHA-256相当
- SyncChangeLogがPull差分履歴の正本
- syncSeqはDB全体で一意な単調増加signed 64-bit
- record update + revision/contentHash/syncSeq/log は同一server transaction

## 5. Local同期

IndexedDBはuser別:
`hk-local-v2-<User.id>`

旧 `hk-local-v1` は移行しない。

3層:
```text
Business tables  = user-visible working state
SyncState        = last known server baseline
Outbox           = unsynchronized local change
```

SyncState:
```text
entityType
entityId
revision
contentHash
syncSeq
serverUpdatedAt
deleted
```

Outbox:
```text
entityType
entityId
operation
baseRevision
contentHash
payload
outboxVersion
createdAt
```

- local業務変更とOutbox更新は同一IndexedDB transaction
- PushはOutbox基準
- 同一entity変更は最新candidateへ集約し、元のbaseRevisionを維持
- sync開始時に送信snapshotを固定
- Push成功時は `current outboxVersion == sent outboxVersion` の場合だけOutbox削除
- sync中再編集は新versionとして保持
- PullだけでOutbox.baseRevisionを前進させない

通常同期:
```text
online auth → Pull → Outbox reapply → Push → Pull
```

## 6. DELETE / tombstone

- local DELETEはBusinessから即時除去し、Outbox DELETEを残す
- Item「取り出す」はDELETEではなく通常UPDATE
- server DELETEはtombstone化
- server DELETE済み + local UPDATE = CONFLICT。自動復活しない
- local DELETE + newer server UPDATE = CONFLICT。自動削除しない
- local DELETE + server DELETE = contentHash同一ならUNCHANGED
- CLIENT winsでserver DELETEを覆す場合のみ明示的復活 `deletedAt=null` とする

### baseRevision=0 DELETE

serverに同IDがない:
```text
UNCHANGED
```

serverに同IDのactive entityがある:
```text
REJECTED
errorCode=ID_COLLISION
retryable=false
```

CREATE成功response lostと真のID衝突を安全に区別できないため、誤削除防止を優先する。persistent operationId履歴は導入しない。

## 7. ID_COLLISION

baseRevision=0 CREATE/UPDATEでserverに同ID:
```text
contentHash同一 → UNCHANGED
contentHash異なる → REJECTED / ID_COLLISION / retryable=false
```

Push responseは回復用に `serverPayload / revision / syncSeq / contentHash` を返す。

client回復は1 IndexedDB transactionで:
1. local candidate旧ID A → 新ID B
2. 全local参照 A→B
3. 影響Business/Outbox/contentHashを更新
4. outboxVersionを進める
5. 旧ID Aへserver canonicalを配置
6. AのSyncStateをserver metadataで作成/更新
7. BはbaseRevision=0で次回Push

参照remap:
- Box A→B: Item.boxId A→B
- BoxLocation A→B: Box.locationId A→B

既存CONFLICT中でもremapは止めず、baseRevisionとSyncConflictは維持する。remapは再入可能・反復可能。server ID予約APIは作らない。

同一Push batchで親がID_COLLISIONなら依存子は:
```text
REJECTED / DEPENDENCY_NOT_AVAILABLE / retryable=true
```
無関係branchは継続する。

## 8. Push API / dependency

Request per operation:
```text
operationId
entityType
entityId
operation
baseRevision
contentHash
payload
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
serverPayload
```

- batchはall-or-nothingにしない
- operationIdは相関用のみ
- idempotencyは revision + contentHash + SyncConflict
- create/update依存順 = BoxLocation → Box → Item
- failureは依存branchだけを止める
- REJECTED retryable=trueはOutbox保持・自動再試行
- REJECTED retryable=falseはOutbox保持・自動再送停止
- 親CONFLICT/ID_COLLISIONなら同batch依存子はDEPENDENCY_NOT_AVAILABLE

## 9. SyncConflict

- `(userId, entityType, entityId)` に未解決1row
- statusなし
- 解決後row削除
- latest client candidate送信時に同じrowを更新

Resolve API:
`POST /sync/conflicts/{conflictId}/resolve`

- resolution = SERVER | CLIENT
- server canonical進行済みならCONFLICT_UPDATED
- stale local candidateなら `STALE_CLIENT_CANDIDATE / retryable=false`
- SERVER winsはserver canonical採用
- CLIENT winsはlatest server revisionを基準に通常更新/DELETE
- OutboxはoutboxVersion一致時のみ解消

server canonicalがcascade等で変化した場合、既存SyncConflictのserver snapshotを最新canonicalへ更新する。更新後 `serverContentHash == clientContentHash` ならSyncConflictを自動解決する。ただしcurrent Outboxが新versionならOutboxは残す。

## 10. 親DELETE cascade

Box DELETE:
- child Item.boxId → UNASSIGNED

BoxLocation DELETE:
- child Box.locationId → UNASSIGNED

v0.8では親DELETE + 全子参照補正を1 server transactionで実行する。分割transactionや非同期delete jobは導入しない。

順序:
```text
子参照補正 UPSERT
→ 各子 revision/contentHash/syncSeq/log 更新
→ 親 tombstone
→ 親 revision/contentHash/syncSeq/log DELETE
→ COMMIT
```

syncSeq/log順も子補正→親DELETE。

別device子UPDATEとの競合はDB transactionのcommit順を境界とする。親DELETE前にcommit済みの子変更は保持し参照だけ補正。親DELETE後に古いbaseRevisionで来た子UPDATEは通常のrevision/contentHash規則で判定する。

子が未解決SyncConflictを持っていても親DELETEをブロックしない。cascade後のserver canonicalでConflictのserver snapshotを更新し、client candidateは保持する。

## 11. reserved UNASSIGNED

各Userについてserverが必ず以下を保証する:
```text
Box(id=UNASSIGNED)
BoxLocation(id=UNASSIGNED)
```

- User作成時に生成
- 既存Userで不足時はserver整合性処理で補完
- 通常Pull / Full Resyncに含める
- local Business tableに保持し正式な参照先として使う
- clientはCREATE/UPDATE/DELETE禁止
- local UI/APIでも編集・削除・Outbox生成禁止
- server防御:
```text
REJECTED
errorCode=RESERVED_ENTITY
retryable=false
```
- tombstone/purge対象外
- ID remap対象外

## 12. Pull

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

- syncSeq順
- 同一entityのchangesは圧縮しない
- page適用成功後のみcursor更新
- page適用 + cursor更新は可能な限り同一local transaction
- Outboxありならserver baseline/SyncState更新後にOutbox payloadを再適用
- server DELETEでもOutboxありならlocal candidateを破棄しない

## 13. Full Resync

- normal Pullとは別API/mode
- current active server canonicalのみ
- snapshot開始時に `snapshotSeq=N` と内容Nを同じ短時間DB transactionで固定
- Box/Item/BoxLocationをsnapshot rowへcopyし、その後transfer中は長時間transactionを保持しない
- Box/Item/BoxLocation別paging、すべて同一snapshotSeq
- page cursorはopaque
- TTL約30分
- user scoped、1 user 1 active snapshot
- snapshot expiry = `FULL_RESYNC_SNAPSHOT_EXPIRED`
- 全series完了後だけstaging→canonicalを原子的採用しcursor=N
- Outbox保持→reapply→Push→final Pull
- local採用成功後のみ `/sync/full/{snapshotId}/complete`
- complete通知失敗はlocal採用をrollbackせず、TTL cleanupに任せる

## 14. tombstone / SyncChangeLog purge

**確定:** tombstone 30日とSyncChangeLog 90日は独立した保持境界とする。

```text
DELETE発生
│
├─ 0〜30日
│   tombstone      : 保持
│   SyncChangeLog  : 保持
│
├─ 30〜90日
│   tombstone      : 物理削除可能
│   SyncChangeLog  : DELETE履歴を保持
│
└─ 90日以降
    SyncChangeLog  : purge可能
    stale cursor   : FULL_RESYNC_REQUIRED
```

規則:
- tombstoneは `deletedAt + 30日` 経過後に物理削除可能
- tombstone物理削除後もDELETE SyncChangeLogは90日まで保持する
- SyncChangeLog purgeとtombstone purgeを同一タイミングにしない
- 通常Pull可否は対象Userについてcursor以降の必要changeが保持されているかで判断する
- retention外のcursorは `FULL_RESYNC_REQUIRED`
- Full Resyncはactive canonicalのみなのでpurge済みtombstoneはsnapshotに含めない
- stale local entityはFull Resyncのcanonical rebuildで消える
- reserved UNASSIGNEDはpurge対象外

根拠: 30日を超えてtombstoneを保持し続けずにDB負荷を抑えつつ、90日以内の端末には通常PullだけでDELETEを伝播できる。90日を超える端末はFull Resyncで安全にcanonicalへ収束できる。

## 15. 認証・状態

オンライン認証成功後、そのアプリ実行sessionに限りoffline利用を許可する。アプリ終了後の再起動にはonline認証を必須とする。

State:
- Auth: LOCKED / AUTHENTICATED
- Connectivity: ONLINE / OFFLINE
- Sync: IDLE / SYNCING / SYNC_ERROR / CONFLICT
- Usage: LOCKED / INITIAL_SYNC / READY / OFFLINE_READY

INITIAL_SYNC:
- 閲覧/検索可
- 書込不可
- 通信系失敗ならOFFLINE_READYへ移行して書込可
- 401/403は認証再評価
- data/consistency/protocol errorはordinary offline扱いにしない

ONLINE復帰時は自動でPull→Push→Pull。手動syncはfallback。

## 16. Backup

- active論理データのみ
- tombstone / Outbox / SyncConflict / SyncChangeLog / cursor / revision / syncSeq等は含めない
- restoreは通常activeデータとして扱う
- contentHashアルゴリズムは同期と共通
- 同一ID+同一hash = 同一データ
- 同一ID+異なるhash = import側で新ID発行 + 参照remap

## 17. 現行実装との差異

- Prisma sync metadata不足
- entity idがglobal PKでuser composite identity未対応
- current Push `where:{id}` にcross-user ownership risk
- revision/contentHash/Outbox/SyncState/Conflict未実装
- Pullはtimestamp基準
- IndexedDBは固定 `hk-local-v1`
- BoxLocationモデルが確定仕様と不一致
- backupのphotoThumbs/thumbs不一致、BoxLocation不足
- Full Resync snapshot/staging未実装

## 18. ロードマップ

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

## 19. 次のアクション

同期設計の主要未定義を最終点検する。

次の判断候補:
**SyncChangeLog purge判定を「作成時刻90日」だけで行うか、各Userのcursor状態を考慮して延長保持するかを確定する。**

推奨候補は、v0.8では固定90日retentionとし、個々のdevice cursorに応じた保持延長は行わない。90日を超えたdeviceはFull Resyncへ送る。device registryやper-device leaseを持たずに済み、現在の単純な同期モデルを維持できるため。

## 20. HLDocS運用上の注意

HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
