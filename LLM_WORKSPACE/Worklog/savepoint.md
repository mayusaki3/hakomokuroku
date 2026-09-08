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

## 4. 主要確定事項

### リリース・業務
- v0.8 = Vision以外の完成版
- v1.0 = v0.8 + Vision/LLM画像認識
- 登録順序 = 箱登録 → アイテム → 箱写真 → ラベル → 場所
- 写真フィールド = `thumbs`
- QR payload = Box.codeのみ
- Item「取り出す」= `boxId=UNASSIGNED` の通常UPDATE
- Item「削除」= DELETE/tombstone
- Box削除 = 子ItemをUNASSIGNEDへ移動後Boxをtombstone
- BoxLocationは独立フラットマスタ。Boxが `locationId` 参照
- BoxLocation = `id / name / note / thumbs + 共通同期メタデータ`
- Vision対象はBox/Item写真のみ
- Box / BoxLocationに予約 `UNASSIGNED`

### Server同期
Box / Item / BoxLocation共通:
`createdAt, updatedAt, deletedAt, serverUpdatedAt, revision, contentHash, syncSeq`

- business identity = `(User.id, entityId)`
- 未同期新規 = revision 0 / baseRevision 0
- 初回server登録成功 = revision 1
- Push userは認証から確定
- contentHash = 業務内容 + active/deleted状態。時刻・revision・syncSeq等は除外
- revision不一致時はcontentHash比較。同一=UNCHANGED、異なる=CONFLICT
- updatedAtで勝者を決めない
- SyncChangeLogがPull差分履歴の正本
- syncSeqはDB全体単調増加signed 64-bit
- tombstone 30日、SyncChangeLog 90日
- stale cursor = FULL_RESYNC_REQUIRED

### Local同期
IndexedDBはuser別:
`hk-local-v2-<User.id>`
旧 `hk-local-v1` は移行しない。

3層:
```text
Business tables  = user-visible working state
SyncState        = last known server baseline
Outbox           = unsynchronized local change
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

- local業務更新とOutbox更新は同一IndexedDB transaction
- PushはOutbox基準
- 同一entity変更は最新candidateへ集約、baseRevision維持
- sync開始時に送信snapshot固定
- Push成功時はcurrent outboxVersion == sent versionの場合のみ削除
- sync中再編集は新versionを保持

通常同期:
```text
online auth → Pull → Outbox reapply → Push → Pull
```

PullだけでOutbox.baseRevisionを前進させない。

### DELETE
- local DELETEはBusinessから即時除去し、Outbox DELETEを作る
- 未同期新規entityもDELETEを省略せず常にOutboxへ載せる
- baseRevision=0でserver entity不存在ならDELETE PushはUNCHANGED
- CREATE送信成功・response lost後のlocal DELETEも同じ経路で吸収
- `hasBeenPushed` 等の追加状態は持たない

### ID_COLLISION
baseRevision=0で同じIDがserverに存在:
```text
hash同一 → UNCHANGED
hash不一致 → REJECTED / ID_COLLISION / retryable=false
```

通常CONFLICTとは分離し、client winsで既存server recordを上書きしない。

Push responseは回復用にserver canonicalを返す:
`serverPayload / revision / syncSeq / contentHash`

client回復:
1. local candidate旧ID A → 新ID B
2. 全local参照をA→Bへremap
3. 参照元Business/Outbox/contentHashを更新
4. outboxVersionを進める
5. 旧ID Aにはserver canonicalを配置
6. AのSyncStateをserver metadataで作成/更新
7. BはbaseRevision=0で次回Push

参照例:
- Box A→B: Item.boxId A→B
- BoxLocation A→B: Box.locationId A→B

通常Pullだけにserver canonical復元を依存しない。

### ID remapと既存CONFLICT
- 参照元entityが既にCONFLICT中でもremapを止めない
- local参照整合性を先に保つ
- Business/Outbox payload/contentHash/outboxVersionを最新candidateへ更新
- baseRevision維持
- SyncConflictは削除しない
- 次回Pushで同じconflict rowのclient snapshotを最新化して再比較

### ID remap連鎖
依存graph:
```text
BoxLocation → Box → Item
```

- 直接・間接影響範囲を可能な限り同一IndexedDB transactionで更新
- 新IDがlocal衝突なら即再生成
- server ID予約APIは作らない
- 新IDがserverでも衝突したら次回PushでID_COLLISIONを検出し同じ処理を再適用
- remapは再入可能・反復可能な同期回復処理

### 同一Push batch内の親ID_COLLISION
- 親operationが `ID_COLLISION` になったdependency branchでは、旧親IDを参照する子operationをserverは適用しない
- 子operationは `DEPENDENCY_NOT_AVAILABLE / retryable=true`
- clientは親のlocal ID remap完了後、更新済みOutboxから次回Pushで子を再送
- 無関係branchは処理継続

### 同一Push batch内の親CONFLICT
- 親operationが `CONFLICT` になったdependency branchでは、未解決の親を参照する子operationを適用しない
- 子operationは `DEPENDENCY_NOT_AVAILABLE / retryable=true`
- 親CONFLICT解決後、最新local Outbox状態で子operationを再Push
- 無関係dependency branchは処理継続

### 親CONFLICT解決後の子Outbox再評価
- conflict resolve responseをlocalへ適用する時点で、その親に依存するlocal dependency branchを再評価
- 親の解決結果で子のbusiness payload/参照が変わる場合、Businessを更新
- Outbox.payloadを最新化
- contentHash再計算
- outboxVersionを進める
- 子自身のbaseRevisionはlast known server baselineを維持
- 親解決を理由に子baseRevisionを前進させない
- 次回Pushで子自身のrevision/contentHash規則により再評価

### 親CONFLICTをSERVER winsで解決し親がDELETE済みの場合
- Box DELETE確定 → 参照するItem.boxId = UNASSIGNED
- BoxLocation DELETE確定 → 参照するBox.locationId = UNASSIGNED
- 補正は子entityの通常local業務変更としてBusiness/Outbox/contentHash/outboxVersionへ反映
- 子自身のbaseRevisionは維持
- 子が既にCONFLICT中でも最新local candidateとして引き継ぐ

### server親DELETE時の子参照補正とSyncChangeLog
**確定:** serverでBox/BoxLocationをDELETEするとき、UNASSIGNEDへ補正される各子entityも正式な業務UPDATEとして個別に同期履歴へ記録する。

同一server transaction内で:
1. 影響する各子entityの参照をUNASSIGNEDへ変更
2. 各子entityを `revision + 1`
3. 各子entityへ個別のsyncSeqを採番
4. 各子entityのSyncChangeLogへUPSERTを追加
5. 最後に親をtombstone化して `revision + 1`
6. 親へ別syncSeqを採番
7. 親のSyncChangeLogへDELETEを追加
8. COMMIT

採番順:
```text
子参照補正 UPSERT → 親 DELETE
```

例:
```text
Item I1.boxId → UNASSIGNED  syncSeq=101 UPSERT
Item I2.boxId → UNASSIGNED  syncSeq=102 UPSERT
Box A DELETE                 syncSeq=103 DELETE
```

BoxLocation DELETEでも同様に、参照Boxの `locationId=UNASSIGNED` 更新を先に記録する。

根拠: 他deviceが通常Pullだけで参照補正を完全に再現でき、Pullのpage境界で途中状態が見えても「削除済み親をまだ参照している」状態を避けやすいため。server canonical上は全変更を同一transactionで確定するため中間状態を外部へ露出しない。

### 親DELETEのtransaction境界
**確定:** v0.8では、親DELETEと、そのDELETEに伴う全子参照補正を原則1 server transactionで実行する。

```text
BEGIN
全子entityの参照 → UNASSIGNED
各子 revision/contentHash/syncSeq/SyncChangeLog更新
親 → tombstone
親 revision/contentHash/syncSeq/SyncChangeLog更新
COMMIT
```

- 子数が多くてもv0.8では分割transactionにしない
- 非同期delete job / background cleanup機構は導入しない
- 通常の箱目録利用規模では1つのBox/BoxLocationにぶら下がる子数は現実的な範囲とする
- 将来、実測でtransaction時間・lock時間が問題になった場合のみ分割方式を追加検討する

根拠: 分割すると「親削除済みだが一部の子が旧親を参照する」中間状態と、その回復・再開・同期順序を別途仕様化する必要がある。v0.8では整合性・単純性・テスト容易性を優先する。

## 5. Push API

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
serverPayload // 必要時
```

- batch全体all-or-nothingにしない
- operationIdは相関用のみ
- idempotencyは revision + contentHash + SyncConflict
- create/update依存順 = BoxLocation → Box → Item
- 一つの失敗は依存branchだけを止める
- 親がID_COLLISION/CONFLICTなら同batchの依存子はDEPENDENCY_NOT_AVAILABLE

## 6. SyncConflict

- `(userId, entityType, entityId)` に未解決1row
- statusなし
- 解決後row削除
- server DELETE vs local UPDATE = CONFLICT。自動復活禁止
- local DELETE vs newer server UPDATE = CONFLICT。自動削除禁止
- local DELETE vs server DELETE = hash同一ならUNCHANGED

Resolve API:
`POST /sync/conflicts/{conflictId}/resolve`

- resolution = SERVER | CLIENT
- stale server snapshotならCONFLICT_UPDATED
- stale local candidateなら `STALE_CLIENT_CANDIDATE / retryable=false`

## 7. Pull / Full Resync

Pull:
```text
changes[]
nextCursor
hasMore
```

- syncSeq順
- 同一entityのchangesは初期仕様では圧縮しない
- page適用成功後だけcursor更新

Full Resync:
- current active server canonicalの固定snapshot
- snapshotSeq=Nと内容Nを同じ短時間DB transactionで固定
- Box/Item/BoxLocation別paging、同一snapshotSeq
- TTL約30分
- stagingへ全取得後にlocal canonicalへ原子的採用
- cursor=snapshotSeq
- Outbox再適用 → Push → final Pull
- local採用成功後のみ `/sync/full/{snapshotId}/complete`

## 8. 認証・状態

- online auth成功後、その実行session内のみoffline利用可
- app再起動後はonline auth必須
- local PIN等は持たない

State:
- Auth: LOCKED / AUTHENTICATED
- Connectivity: ONLINE / OFFLINE
- Sync: IDLE / SYNCING / SYNC_ERROR / CONFLICT
- Usage: LOCKED / INITIAL_SYNC / READY / OFFLINE_READY

INITIAL_SYNC中は閲覧可・書込不可。通信系失敗ならOFFLINE_READYへ移行して書込可。

## 9. Backup

- active論理データのみ
- tombstone / Outbox / SyncConflict / SyncChangeLog / cursor / revision / syncSeq等は含めない
- restoreは通常activeデータとして扱う
- 同一ID + 同一hash = 同一データ
- 同一ID + 異なるhash = import側で新ID発行 + 参照remap

## 10. 現行実装との主要差異

- Prisma sync metadata不足
- entity idがglobal PKでuser composite identity未対応
- current Push `where:{id}` にcross-user ownership risk
- revision/contentHash/Outbox/SyncState/Conflict未実装
- Pullはtimestamp基準
- IndexedDBは固定 `hk-local-v1`
- BoxLocationモデルが確定仕様と不一致
- backupのphotoThumbs/thumbs不一致、BoxLocation不足
- Full Resync snapshot/staging未実装

## 11. ロードマップ

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

## 12. 次のアクション

次の設計判断点:
**server親DELETE transaction内で、子entity自身が同時に別deviceから更新されようとしている場合の競合境界を確定する。**

推奨候補:
- 親DELETE transactionがDB lock/transaction isolation下で子の最新revisionを確定して参照補正する
- 親DELETEに伴う子補正はserver-side cascade業務操作であり、個別client baseRevisionを持たない
- 競合する別deviceの子UPDATEは、親DELETE transactionのcommit後に古いbaseRevisionとして到着すれば通常CONFLICTになる
- 親DELETEより先に子UPDATEがcommit済みなら、その最新内容を保持したまま参照だけUNASSIGNEDへ変更し revision+1 する

詳細作業記録: `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`

## 13. HLDocS運用上の注意

HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
