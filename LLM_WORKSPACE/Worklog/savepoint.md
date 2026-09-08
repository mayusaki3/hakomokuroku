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

### Server同期
- business identity = `(User.id, entityId)`
- 共通同期メタデータ = `createdAt, updatedAt, deletedAt, serverUpdatedAt, revision, contentHash, syncSeq`
- 未同期新規 = revision 0 / baseRevision 0
- revision不一致時はcontentHash比較。同一=UNCHANGED、異なる=CONFLICT
- updatedAtで勝者を決めない
- SyncChangeLogがPull差分履歴の正本
- syncSeqはDB全体で一意な単調増加signed 64-bit

### Local同期
- user別DB = `hk-local-v2-<User.id>`
- 旧 `hk-local-v1` は移行しない
- 3層 = Business / SyncState / Outbox
- local業務変更とOutbox更新は同一IndexedDB transaction
- PushはOutbox基準
- sync中再編集はoutboxVersionで保護
- PullだけでOutbox.baseRevisionを前進させない
- 通常同期 = Pull → Outbox reapply → Push → Pull

### DELETE / CONFLICT
- local DELETEはBusinessから即時除去しOutbox DELETEを残す
- server DELETE済み + local UPDATE = CONFLICT
- local DELETE + newer server UPDATE = CONFLICT
- local DELETE + server DELETE = hash同一ならUNCHANGED
- CLIENT winsでserver DELETEを覆す場合のみ明示的復活

### baseRevision=0 DELETE
```text
server同IDなし    → UNCHANGED
server active同ID → REJECTED / ID_COLLISION / retryable=false
```
CREATE成功response lostと真のID衝突を安全に区別できないため、誤削除防止を優先する。

### ID_COLLISION
- baseRevision=0 CREATE/UPDATEでserver同ID + hash同一 → UNCHANGED
- hash異なる → `REJECTED / ID_COLLISION / retryable=false`
- Push responseは `serverPayload / revision / syncSeq / contentHash` を返す
- clientはlocal candidateを新IDへremapし、参照・Outbox・contentHashを更新
- remapは既存CONFLICT中でも止めない
- remapは再入可能・反復可能
- parent ID_COLLISION/CONFLICT時、同batch依存子は `DEPENDENCY_NOT_AVAILABLE / retryable=true`

### SyncConflict
- `(userId, entityType, entityId)` に未解決1row
- statusなし、解決後削除
- stale server snapshot = CONFLICT_UPDATED
- stale client candidate = `STALE_CLIENT_CANDIDATE / retryable=false`
- cascade等でserver snapshot更新後にserver/client hashが一致した場合は自動解決
- current Outboxが新versionならOutboxは保持

### 親DELETE cascade
- Box DELETE → child Item.boxId = UNASSIGNED
- BoxLocation DELETE → child Box.locationId = UNASSIGNED
- v0.8では親DELETE + 全子参照補正を1 server transaction
- syncSeq/log順 = 子補正UPSERT → 親DELETE
- 子が未解決SyncConflictを持っていても親DELETEをブロックしない

### reserved UNASSIGNED
各Userについてserverが必ず保証:
```text
Box(id=UNASSIGNED)
BoxLocation(id=UNASSIGNED)
```
- 通常Pull / Full Resyncに含める
- localでは正式参照先として保持
- client CREATE/UPDATE/DELETE禁止
- serverは `REJECTED / RESERVED_ENTITY / retryable=false`
- tombstone/purge/ID remap対象外

### Pull
- `changes[] / nextCursor / hasMore`
- syncSeq順、同一entity changeは圧縮しない
- page適用成功後のみcursor更新
- Outboxありならserver baseline更新後にOutbox payloadを再適用
- 通常Pullは有効なcursorを持つclientのみ使用

### Full Resync
- current active server canonicalのみ
- snapshot開始時に `snapshotSeq=N` と内容Nを同じ短時間DB transactionで固定
- entity type別paging、同一snapshotSeq
- snapshot TTL約30分
- staging全完了後だけlocal canonicalへ原子的採用しcursor=N
- Outbox保持 → reapply → Push → final Pull
- local採用成功後のみ `/sync/full/{snapshotId}/complete`

### 新規client DB
**確定:** cursor未設定の新規clientは通常Pullを使わず必ずFull Resyncから開始する。

```text
新規 user DB
cursor未設定
↓
Full Resync
↓
current canonical採用
↓
cursor=snapshotSeq
↓
以後通常Pull
```

### 初回Full Resync失敗時のoffline利用
**確定:** 新規client DBでは、そのuser DBで最低1回Full Resyncが正常完了するまでoffline編集を許可しない。

```text
新規DB / canonical未確立
Full Resync通信失敗
→ INITIAL_SYNC維持
→ 閲覧可能範囲は現local内容のみ
→ 書き込み不可
→ online復帰後Full Resync再試行
```

既存user DBではcanonical確立済みなら通信系失敗時に `OFFLINE_READY` へ移行し、閲覧・編集を継続できる。

### 既存canonicalありのFull Resync失敗
**確定:** cursor失効等でFull Resyncが必要になっても、完了するまで既存Business / SyncState / cursor / Outboxを変更しない。

```text
既存canonicalあり
↓
FULL_RESYNC_REQUIRED
↓
Full Resyncをstagingへ取得
↓
通信途中で失敗
↓
未完成stagingは未採用
既存Business / SyncState / cursor / Outbox維持
↓
OFFLINE_READY
```

### Full Resync中のlocal編集
**確定:** 既存canonicalを持つuser DBでは、Full Resyncのstaging取得中も通常編集を許可する。

```text
既存canonical
↓
Full Resync開始
├─ server snapshot → stagingへ取得
└─ user編集 → Business + Outboxへ保存
↓
Full Resync取得完了
↓
stagingを新canonicalとして採用
↓
その時点の最新Outboxをreapply
↓
Push
↓
final Pull
```

### Full Resync snapshot採用transaction
**確定:** `staging → Business/SyncState置換 + latest Outbox reapply + cursor=snapshotSeq` を1つのIndexedDB transactionで原子的に実行する。

```text
BEGIN IndexedDB transaction

1. staging snapshotを読む
2. Businessをsnapshot canonicalへ置換
3. SyncStateをsnapshot metadataへ置換
4. latest Outboxを読む
5. Outbox payloadをBusinessへreapply
6. cursor = snapshotSeq

COMMIT
```

- user編集transactionとFull Resync採用transactionはIndexedDB transaction境界で直列化する
- 採用transaction前にcommit済みの編集はlatest Outboxとしてreapplyされる
- 採用transaction後にcommitする編集は新canonical上への通常編集になる
- snapshot採用transaction失敗時は全体rollbackし、旧canonical / old cursor / Outboxを維持する
- `/sync/full/{snapshotId}/complete` はlocal採用transaction成功後にのみ送信する

### Full Resync後の孤児参照補正
**確定:** Full Resync snapshot採用時に最新Outboxをreapplyする際、local candidate本体は保持する。candidateが参照する親entityがsnapshotに存在しない場合は、参照だけreserved `UNASSIGNED`へ補正する。

```text
Item candidate
boxId = BOX-A

snapshotに BOX-A なし
↓
Item candidate自体はBusinessへ保持
boxId = UNASSIGNED に補正
Outbox.payload更新
contentHash再計算
outboxVersion++
baseRevision維持
```

BoxLocation参照も同様:
```text
Box.locationId がsnapshotに存在しない
→ locationId = UNASSIGNED
```

規則:
- candidateの非参照business contentは失わない
- 親がsnapshotに存在しないことだけを理由にcandidateを削除しない
- 親参照補正はFull Resync採用transaction内で行う
- 補正されたcandidateはBusinessへ反映する
- 対応Outboxのpayloadを補正後candidateへ更新する
- contentHashを再計算する
- outboxVersionをincrementする
- baseRevisionはcandidate自身のserver baselineなので変更しない
- 親が後からlocal Outboxによってreapplyされる予定でも、snapshot canonicalに存在しない親への参照をそのまま保持しない
- reserved UNASSIGNED自体はsnapshotに必ず含まれる前提であり、補正先として安全に利用できる

根拠: Full Resyncはactive canonicalのみを返すため、tombstone purge済みの親DELETEは履歴として見えない場合がある。local candidateを保持しつつ参照だけ補正することで、未同期編集を失わず、孤児参照も残さない。

### tombstone / SyncChangeLog purge
- tombstone = deletedAt + 30日後に物理削除可能
- SyncChangeLog = 作成から固定90日保持
- device cursorによる保持延長なし
- Pull可否は90日という時刻境界ではなく、対象Userのcursor以降に必要なlogが実際に保持されているかで判断
- 欠落済み、または欠落していないことを保証できない場合は `FULL_RESYNC_REQUIRED`
- Full Resyncはactive canonicalのみ。purge済みtombstone由来のstale localはcanonical rebuildで消える

### 認証・状態
- online auth成功後、その実行session内のみoffline利用可
- app再起動後はonline auth必須
- Auth: LOCKED / AUTHENTICATED
- Connectivity: ONLINE / OFFLINE
- Sync: IDLE / SYNCING / SYNC_ERROR / CONFLICT
- Usage: LOCKED / INITIAL_SYNC / READY / OFFLINE_READY
- data/consistency/protocol errorはordinary offline扱いにしない

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
**Full Resync採用時に、親entity自身もlocal Outboxで未同期CREATEされているためsnapshotには存在しない場合、子参照をUNASSIGNEDへ補正するか、local parent-child関係を復元するかを確定する。**

推奨候補は、latest Outboxを依存順 `BoxLocation → Box → Item` でreapplyし、親candidateが同じlocal Outboxに存在する場合はそのparentをlocal Businessへ先に復元して子参照を維持する方式。snapshotにもOutboxにも親が存在しない場合だけUNASSIGNEDへ補正する。これによりofflineで新規Location→Box→Itemを作成した一連の未同期データをFull Resyncで壊さない。

## 7. HLDocS運用上の注意

HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。