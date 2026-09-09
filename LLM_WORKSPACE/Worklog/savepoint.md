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

### 同期アーキテクチャ
- business identity = `(User.id, entityId)`
- server同期メタデータ = `createdAt, updatedAt, deletedAt, serverUpdatedAt, revision, contentHash, syncSeq`
- 未同期新規 = revision 0 / baseRevision 0
- revision不一致時はcontentHash比較。同一=UNCHANGED、異なる=CONFLICT
- SyncChangeLogがPull差分履歴の正本
- syncSeqはDB全体で一意な単調増加signed 64-bit
- user別local DB = `hk-local-v2-<User.id>`
- local 3層 = Business / SyncState / Outbox
- local業務変更とOutbox更新は同一IndexedDB transaction
- PushはOutbox基準、sync中再編集はoutboxVersionで保護
- 通常同期 = Pull → Outbox reapply → Push → Pull

### updatedAt / serverUpdatedAt
**確定:** 時刻フィールドの責務を分離する。

```text
updatedAt
→ business dataを実際に編集したclient側時刻

serverUpdatedAt
→ serverがその変更を受理しcanonicalを更新したserver側時刻
```

規則:
- local編集時に`updatedAt`を更新する
- offline編集でもその編集時刻を保持する
- Push受理時、serverはclientから受け取った`updatedAt`を原則そのままcanonicalへ反映し、server現在時刻で上書きしない
- server側でcascade、自動rename、参照補正などserver自身がbusiness dataを変更した場合は、そのserver操作時刻を`updatedAt`へ設定する
- canonicalがserverで更新された時点で`serverUpdatedAt`をserver現在時刻へ更新する
- `updatedAt`はrevision conflictの勝者判定に使用しない
- Pull順序やcursor判定にも`updatedAt`を使用しない
- 同期整合性は`revision / contentHash / syncSeq`を基準とする

根拠: `updatedAt`をbusiness dataが実際に変更された時刻、`serverUpdatedAt`をserver canonical更新時刻と分離することで、offline編集時刻を失わない。一方、device clockにはずれがあり得るため、updatedAtを競合解決や同期順序の根拠には使用しない。server自身がbusiness変更を発生させる操作ではserverが編集主体なので、そのserver時刻をupdatedAtとして扱う。

### DELETE / CONFLICT / UNASSIGNED
- Box DELETE → child Item.boxId = UNASSIGNED
- BoxLocation DELETE → child Box.locationId = UNASSIGNED
- server parent DELETE + child補正は1 transaction、子UPSERT log → 親DELETE log
- reserved `Box(id=UNASSIGNED)` / `BoxLocation(id=UNASSIGNED)` を各Userで保証
- reserved entityはclient変更禁止、serverは `RESERVED_ENTITY / retryable=false`
- SyncConflictは `(userId, entityType, entityId)` につき未解決1row、statusなし、解決後削除

### Pull / Full Resync
- Pull = `changes[] / nextCursor / hasMore`、syncSeq順、page適用成功後のみcursor更新
- cursor未設定の新規DBは必ずFull Resyncから開始
- Full Resyncはcurrent active canonicalのみ
- snapshot開始時に `snapshotSeq=N` と内容Nを固定
- entity type別paging、snapshot TTL約30分
- staging全完了後のみlocal canonicalへ採用
- 新規DBは初回Full Resync成功まで書き込み不可
- 既存canonicalありならFull Resync途中失敗後も旧canonicalを保持してOFFLINE_READYへ戻れる
- 既存canonicalありならFull Resync staging取得中もlocal編集可

### Full Resync採用transaction
`staging → Business/SyncState置換 + latest Outbox reapply + cursor=snapshotSeq` を1つのIndexedDB transactionで原子的に行う。

```text
BEGIN IndexedDB transaction
1. staging snapshotを読む
2. Businessをsnapshot canonicalへ置換
3. SyncStateをsnapshot metadataへ置換
4. latest Outboxを読む
5. Outboxを依存順にreapply
6. 必要な参照補正を行う
7. cursor = snapshotSeq
COMMIT
```

- user編集transactionと採用transactionはIndexedDB transaction境界で直列化
- transaction失敗時は旧canonical / old cursor / Outboxを維持
- `/sync/full/{snapshotId}/complete` はlocal採用成功後のみ送信

### Full Resync時のOutbox reapplyと参照判定
Outbox reapply順:
```text
BoxLocation → Box → Item
```

親参照判定:
```text
snapshotに親あり
→ snapshot親を参照

snapshotに親なし + latest Outboxに有効な親CREATE/UPDATE candidateあり
→ parent candidateを先にreapplyし、local親子関係を維持

snapshotにも有効な親Outboxにも親なし
→ 子candidate本体は保持し、参照だけUNASSIGNEDへ補正
```

補正時:
- Businessを補正
- Outbox.payload更新
- contentHash再計算
- outboxVersion++
- baseRevision維持

### Outbox親DELETE時の正規化
parentのlatest Outbox operationがDELETEの場合、そのparentは参照可能な親として扱わない。子entity本体は保持し、参照のみreserved `UNASSIGNED`へ補正する。

### Outbox operation畳み込み
**確定:** Outboxは履歴ではなく「latest unsynced candidate」を保持する。同一entityにつき1 rowとし、operationもlatest local intentへ畳み込む。

```text
CREATE + 編集 → CREATEのままpayload最新化 / baseRevision=0維持
CREATE + DELETE → DELETEへ変更 / baseRevision=0維持
UPDATE + 編集 → UPDATEのままpayload最新化 / baseRevision維持
UPDATE + DELETE → DELETEへ変更 / baseRevision維持
```

DELETE後の明示的復活は、server canonicalに対する意味でoperationを決める。

```text
baseRevision = 0
CREATE → DELETE → 復活
→ CREATEへ戻す
→ baseRevision=0維持

baseRevision > 0
UPDATE → DELETE → 復活
→ UPDATEへ戻す
→ 元のbaseRevision維持
```

共通規則:
- 同一 `(entityType, entityId)` につきOutbox 1 row
- local操作のたびに `outboxVersion++`
- CREATE/UPDATEでは最新business payload + contentHash
- DELETEではdelete-state contentHash、payload原則null
- Outbox.createdAtはrow作成時刻を維持
- PullだけではbaseRevisionを変更しない
- `CREATE → DELETE` でもOutboxを消さない

根拠: Outbox.operationは単なる直前操作ではなく「server canonicalに対して何を要求するcandidateか」を表す。baseRevision=0のentityはlocal上で削除・復活を経てもserverから見れば新規であるためCREATEが正しい。baseRevision>0のentityはserver既存entityの変更なのでUPDATEが正しい。

### DELETE後の同一ID復活時刻
**確定:** DELETE後に同一IDを明示的に復活させる場合は、新規entityではなく同一business entityのライフサイクル継続として扱う。

```text
createdAt → 元の値を維持
updatedAt → 復活操作時刻へ更新
deletedAt → null
```

server上でdeleted entityに対してCONFLICTをCLIENT winsで解決し復活させる場合も同じ規則を適用する。

server側の復活処理では通常のbusiness updateとして:
- `createdAt` を変更しない
- `updatedAt` は復活candidateのbusiness編集時刻を維持する。server自身が復活操作のbusiness変更主体となる場合のみserver時刻
- `deletedAt = null`
- `revision + 1`
- `serverUpdatedAt` 更新
- active-state `contentHash` 再計算
- 新しい `syncSeq` 採番
- SyncChangeLogへUPSERT
を同一transactionで行う。

### retention
- tombstone = deletedAt + 30日後に物理削除可能
- SyncChangeLog = 固定90日保持、device cursorによる延長なし
- Pull可否は対象Userのcursor以降に必要なlogが実際に保持されているかで判定
- 欠落済み、または完全性を保証できない場合は `FULL_RESYNC_REQUIRED`

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
**clientから送信された`createdAt`をserver canonicalでどこまで信頼するかを確定する。**

推奨候補:
- baseRevision=0の新規CREATEでは、clientの`createdAt`をbusiness生成時刻として採用する
- ただしserver既存entityのUPDATE/復活では、canonicalの既存`createdAt`を必ず維持しclient値で上書きしない
- server側のreserved entityや自動生成entityはserver時刻でcreatedAtを設定する
- createdAtも競合判定・同期順序には使用しない

これによりofflineで新規作成した実時刻を保持しつつ、既存entityの起点をclient payloadで改ざん・誤更新できない。

## 7. HLDocS運用上の注意

HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。