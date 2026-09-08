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
確定:
- 親operationが `ID_COLLISION` になったdependency branchでは、旧親IDを参照する子operationをserverは適用しない
- 子operationは以下を返す

```text
REJECTED
errorCode=DEPENDENCY_NOT_AVAILABLE
retryable=true
```

- clientは親のlocal ID remapを完了後、更新済みOutboxから次回Pushで子を再送
- 無関係dependency branchは処理継続

例:
```text
Box A → ID_COLLISION
Item A1 → DEPENDENCY_NOT_AVAILABLE

Box C → APPLIED
Item C1 → APPLIED
```

根拠: serverは同batch内ではclient側の新IDを知らないため、旧ID参照の子を適用すると参照整合性を壊す。既存の「失敗はdependency branchだけを止める」原則にも一致する。

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
- 同一ID + 同一hash = 同一
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
**親operationがCONFLICTになった同一Push batchで、その親を参照する子operationをどう扱うかを確定する。**

推奨候補:
- ID_COLLISIONと同様、親CONFLICTが未解決の間は子operationを適用しない
- 子は `DEPENDENCY_NOT_AVAILABLE / retryable=true`
- 親CONFLICT解決後、local Outboxの最新参照状態で子を再Push
- 無関係branchは継続

詳細作業記録: `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`

## 13. HLDocS運用上の注意

HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
