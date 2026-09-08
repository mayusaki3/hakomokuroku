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

## 3. リリース・業務

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

## 4. Server同期

Box / Item / BoxLocation共通同期メタデータ:
`createdAt, updatedAt, deletedAt, serverUpdatedAt, revision, contentHash, syncSeq`

- business identity = `(User.id, entityId)`
- Push userは認証から確定
- 未同期新規 = revision 0 / baseRevision 0
- 初回server登録成功 = revision 1
- revision不一致時はcontentHash比較。同一ならUNCHANGED、異なればCONFLICT
- updatedAtで勝者を決めない
- contentHash = 業務内容 + active/deleted状態。同期メタデータは除外
- order-insensitive arrayはsort、object keyは決定的順序、SHA-256相当
- SyncChangeLogがPull差分履歴の正本
- syncSeqはDB全体で一意な単調増加signed 64-bit
- record変更 + revision/contentHash/syncSeq/log は同一server transaction

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
- 同一entity変更は最新candidateへ集約し元のbaseRevision維持
- sync開始時に送信snapshot固定
- Push成功時はcurrent outboxVersion == sent outboxVersionの場合だけOutbox削除
- sync中再編集は新versionとして保持
- PullだけでOutbox.baseRevisionを前進させない

通常同期:
```text
online auth → Pull → Outbox reapply → Push → Pull
```

## 6. DELETE / tombstone

- local DELETEはBusinessから即時除去し、Outbox DELETEを残す
- server DELETEはtombstone化
- server DELETE済み + local UPDATE = CONFLICT
- local DELETE + newer server UPDATE = CONFLICT
- local DELETE + server DELETE = hash同一ならUNCHANGED
- CLIENT winsでserver DELETEを覆す場合のみ明示的復活

baseRevision=0 DELETE:
```text
server同IDなし    → UNCHANGED
server active同ID → REJECTED / ID_COLLISION / retryable=false
```

CREATE成功response lostと真のID衝突を安全に区別できないため、誤削除防止を優先する。persistent operationId履歴は導入しない。

## 7. ID_COLLISION

baseRevision=0 CREATE/UPDATEでserverに同ID:
```text
hash同一 → UNCHANGED
hash異なる → REJECTED / ID_COLLISION / retryable=false
```

Push responseは回復用に `serverPayload / revision / syncSeq / contentHash` を返す。

client回復は1 IndexedDB transactionで:
1. local candidate旧ID A → 新ID B
2. 全local参照 A→B
3. 影響Business/Outbox/contentHash更新
4. outboxVersion更新
5. 旧ID Aへserver canonical配置
6. AのSyncState更新
7. BはbaseRevision=0で次回Push

参照remap:
- Box A→B: Item.boxId A→B
- BoxLocation A→B: Box.locationId A→B

既存CONFLICT中でもremapは止めず、baseRevisionとSyncConflictは維持する。remapは再入可能・反復可能。server ID予約APIは作らない。

## 8. Push / dependency

Push result:
`APPLIED | UNCHANGED | CONFLICT | REJECTED`

- batchはall-or-nothingにしない
- operationIdは相関用のみ
- idempotencyは revision + contentHash + SyncConflict
- create/update依存順 = BoxLocation → Box → Item
- failureは依存branchだけを止める
- 親CONFLICT/ID_COLLISIONなら同batch依存子は `DEPENDENCY_NOT_AVAILABLE / retryable=true`
- REJECTED retryable=trueはOutbox保持・自動再試行
- REJECTED retryable=falseはOutbox保持・自動再送停止

## 9. SyncConflict

- `(userId, entityType, entityId)` に未解決1row
- statusなし
- 解決後row削除
- latest client candidate送信時に同じrowを更新
- server canonical進行済みならCONFLICT_UPDATED
- stale local candidateなら `STALE_CLIENT_CANDIDATE / retryable=false`
- OutboxはoutboxVersion一致時のみ解消
- cascade等でserver canonicalが変わった場合はserver snapshotを最新化
- server/client contentHash一致なら自動解決。ただしcurrent Outboxが新versionならOutboxは保持

## 10. 親DELETE cascade

Box DELETE:
- child Item.boxId → UNASSIGNED

BoxLocation DELETE:
- child Box.locationId → UNASSIGNED

v0.8では親DELETE + 全子参照補正を1 server transactionで実行する。

順序:
```text
子参照補正 UPSERT
→ 各子 revision/contentHash/syncSeq/log
→ 親 tombstone
→ 親 revision/contentHash/syncSeq/log DELETE
→ COMMIT
```

- syncSeq/log順も子補正→親DELETE
- 別device子UPDATEとの競合はDB transaction commit順を境界とする
- 子が未解決SyncConflictを持っていても親DELETEをブロックしない
- cascade後のserver canonicalでConflict server snapshotを更新しclient candidateは保持

## 11. reserved UNASSIGNED

各Userについてserverが必ず以下を保証する:
```text
Box(id=UNASSIGNED)
BoxLocation(id=UNASSIGNED)
```

- User作成時に生成
- 既存Userで不足時はserver整合性処理で補完
- 通常Pull / Full Resyncに含める
- local Business tableに正式参照先として保持
- client CREATE/UPDATE/DELETE禁止
- local UI/APIでも編集・削除・Outbox生成禁止
- serverは `REJECTED / RESERVED_ENTITY / retryable=false`
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
- 通常Pullは有効なcursorを持つclientのみ使用する

## 13. Full Resync

- normal Pullとは別API/mode
- current active server canonicalのみ
- snapshot開始時に `snapshotSeq=N` と内容Nを同じ短時間DB transactionで固定
- Box/Item/BoxLocationをsnapshot rowへcopyし、その後transfer中は長時間transactionを保持しない
- entity type別paging、すべて同一snapshotSeq
- page cursorはopaque
- TTL約30分
- user scoped、1 user 1 active snapshot
- snapshot expiry = `FULL_RESYNC_SNAPSHOT_EXPIRED`
- 全series完了後だけstaging→canonicalを原子的採用しcursor=N
- Outbox保持→reapply→Push→final Pull
- local採用成功後のみ `/sync/full/{snapshotId}/complete`
- complete通知失敗はlocal採用をrollbackせずTTL cleanup

### 新規client DBの初回同期

**確定:** 新規client DBではcursorを未設定とし、初回同期に通常Pullを使用しない。必ずFull Resyncから開始する。

```text
新規 user DB
cursor = 未設定
↓
Full Resync
↓
current active canonical取得
↓
staging完了後local canonicalへ原子的採用
↓
cursor = snapshotSeq
↓
以後通常Pull
```

- `cursor=0` を初回同期用の特別値として使用しない
- cursor未設定はFull Resync必須状態を表す
- Full Resync完了前に通常Pullへ移行しない
- Full Resync完了時に初めて有効なcursorを保存する
- 以後の通常同期はそのcursorを基準にPull→Push→Pull

根拠: SyncChangeLogは90日保持のため、cursor=0から履歴だけを再生しても90日より前に作成され現在もactiveなentityを新規clientへ復元できない。新規clientは履歴ではなく現在canonicalから開始する必要がある。

## 14. tombstone / SyncChangeLog purge

保持:
```text
0〜30日   : tombstone保持 / SyncChangeLog保持
30〜90日  : tombstone物理削除可 / SyncChangeLog保持
90日以降  : SyncChangeLog purge可
```

- tombstone = deletedAt + 30日後に物理削除可能
- SyncChangeLog = 作成から固定90日保持。device cursorによる延長なし
- device registry / per-device lease / retention pinningは導入しない
- Full Resyncはactive canonicalのみ
- purge済みtombstoneのstale local entityはFull Resyncのcanonical rebuildで消える
- reserved UNASSIGNEDはpurge対象外

Pull可否:
```text
必要なchangeがすべて保持されている
→ 通常Pull

必要なchangeが欠落済み、または欠落していないことを保証できない
→ FULL_RESYNC_REQUIRED
```

- 90日はpurge jobの保持目安でありprotocol安全性判定そのものではない
- Pullとpurgeが競合した場合はserverのtransaction/読み取り時点のretained logを基準とする
- cursor有効性は対象Userについて必要なretained logが連続して存在するかで評価する

## 15. 認証・状態

オンライン認証成功後、そのアプリ実行sessionに限りoffline利用可。アプリ終了後の再起動にはonline認証必須。

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
**新規clientの初回Full Resyncが通信失敗した場合に、既存の「INITIAL_SYNC通信失敗 → OFFLINE_READY」規則をそのまま適用するかを確定する。**

初回DBはまだserver canonicalを一度も取得していないため、空DBのままOFFLINE_READYへ遷移して新規データを作成可能にすると、その後のFull Resync + Outbox reapplyで安全に統合できる一方、初回の既存serverデータを利用者が見られない状態で作業開始することになる。

## 20. HLDocS運用上の注意

HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。