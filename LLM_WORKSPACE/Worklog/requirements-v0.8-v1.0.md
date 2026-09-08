# 箱目録 v0.8 / v1.0 要件整理（作業記録）

> このファイルは一時作業記録であり、正式な要件仕様の正本ではない。正式成果物化時に `docs` 配下へ反映する。

## 1. リリース方針

### v0.8 必須
- 認証
- 箱管理
- アイテム管理
- 写真管理
- 置き場所管理
- QR発行・読み取り
- 検索
- IndexedDB
- オフライン
- サーバー同期
- バックアップ / リストア
- QRラベル印刷
- PWA

### v1.0 必須
- v0.8 全機能
- Vision / LLM画像認識

### 対象外
- 高度なテーマ機能の追加開発

## 2. 正式登録フロー

標準登録順序は次のとおり。

1. 箱登録
2. アイテム
3. 箱写真
4. ラベル
5. 場所

場所はスキップ可能な後決め項目とする。新規Boxの `locationId` は原則 `UNASSIGNED` とし、箱詰め後・引っ越し後などに置き場所を確定できる。

根拠:
- 引っ越しでは置き場所を決めずに箱詰めを進め、移動後に未開封箱の保管場所を決める運用が自然なため。
- 現行 `RegisterClient.tsx` の登録順序とも整合するため。

## 3. アイテムの取り出しと削除

### 3.1 取り出す
- 「箱から取り出した」を表す。
- アイテム自体は削除しない。
- `boxId = UNASSIGNED` に変更する。
- 名前、タグ、メモ、写真等は保持する。

### 3.2 削除する
- 「アイテムを捨てた」を表す。
- `deletedAt` を設定して論理削除する。
- 同期による削除受理後、ローカルtombstoneを物理削除できる。

UIでは「取り出す」と「削除する」を明確に区別する。

## 4. Box / UNASSIGNED

各ユーザーは予約Box `UNASSIGNED` を持つ。

- `id = UNASSIGNED`
- `code = UNASSIGNED`
- Itemがどの箱にも入っていない状態を `Item.boxId = UNASSIGNED` で表す。
- 予約Boxは通常削除不可・通常編集不可。

箱削除時:
- 所属Itemを `UNASSIGNED` へ移動する。
- Box自体は `deletedAt` を設定して論理削除する。
- BoxLocationは独立した置き場所マスタなので削除しない。

## 5. BoxLocation

BoxLocationはBox従属1:1ではなく、部屋・押入れ・棚など「置き場所そのもの」を表す独立マスタとする。

### 5.1 関係
- Box : BoxLocation = 多対1
- Box側が `locationId` でBoxLocationを参照する。
- BoxLocationに `boxId` は持たせない。
- 階層構造は持たせない。

### 5.2 予約置き場所
各ユーザーは予約BoxLocation `UNASSIGNED` を持つ。

- 新規Boxの `locationId = UNASSIGNED`
- 「置き場所未定」を通常状態として扱う。
- `UNASSIGNED` BoxLocationは通常削除不可・通常編集不可。

### 5.3 項目案

```text
id
name
note
thumbs
meta
aiState
aiUpdatedAt
createdAt
updatedAt
deletedAt
serverUpdatedAt
revision
contentHash
syncSeq
```

`code` は持たせない。

### 5.4 name一意・後勝ち
- `BoxLocation.name` は同一ユーザー内で一意。
- 同名が発生した場合、新しくサーバーが受理する名称を優先する「後勝ち」とする。
- 既存側を `名前(n)` へ自動改名する。
- `n` は未使用の最小正整数。
- 「後」は端末 `updatedAt` ではなくサーバー受理順で決める。
- 異なるID同士の同名はrevision競合ではなく名前一意制約の自動解決として扱う。
- 既存側の自動改名も通常の業務更新として `updatedAt` / `contentHash` / `revision` / `serverUpdatedAt` / `syncSeq` / `SyncChangeLog` を更新する。
- 新規/変更対象の保存と既存側の自動改名は同一サーバートランザクション。
- `UNASSIGNED` は予約名のため通常レコードへの使用禁止。

例:

```text
既存: 書斎
新規: 書斎

結果:
既存: 書斎(1)
新規: 書斎
```

### 5.5 BoxLocation削除
通常BoxLocation削除時:
1. 参照しているBoxの `locationId` を `UNASSIGNED` へ変更。
2. 各Boxの同期メタデータを更新。
3. BoxLocationをtombstone化。
4. 対応するSyncChangeLogを追加。

一つの論理操作として原子的に実行する。

## 6. 写真保存方式

正式フィールドは `thumbs` とする。

現行 `backup.ts` の `photoThumbs` は不整合であり実装修正対象。

## 7. 同期メタデータ

Box / Item / BoxLocation に以下を持たせる。

```text
createdAt
updatedAt
deletedAt
serverUpdatedAt
revision
contentHash
syncSeq
```

意味:
- `createdAt`: データ作成時刻
- `updatedAt`: 実データ内容の最終変更時刻
- `deletedAt`: 論理削除時刻。通常状態はnull
- `serverUpdatedAt`: サーバーが最後に受理・更新した時刻
- `revision`: サーバー管理のレコード版番号
- `contentHash`: 内容同一性判定
- `syncSeq`: サーバー変更通番

新規ローカルレコードは `revision = 0`、初回サーバー登録成功時に `revision = 1` とする。

## 8. 同期競合方式

`updatedAt` の新旧では勝敗を決めない。

Push時:

```text
baseRevision == server.revision
→ 通常更新

baseRevision != server.revision
→ contentHash比較
   同一     → 実質同一内容として競合不要
   不一致   → ユーザー確認が必要な競合
```

`updatedAt` は表示・監査・補助情報として保持するが、自動競合解決の勝者判定には使わない。

## 9. contentHash

同期とバックアップの衝突判定で同じcanonical化・hash計算仕様を共通利用する。

含める:
- 業務内容
- 削除状態（active / deleted）

除外:
- `id`
- `userId`
- `createdAt`
- `updatedAt`
- `deletedAt` の時刻値
- `serverUpdatedAt`
- `revision`
- `syncSeq`
- `contentHash`

正規化:
- object key順を決定的にする。
- 順序非依存配列（例: tags）はソートする。
- canonical JSON化後、SHA-256等の決定的hashを使用する。

## 10. 削除伝播

論理削除フィールドは `deletedAt` に統一する。

サーバーtombstone保持期間は30日。

ローカル:
1. 削除操作
2. `deletedAt` 設定
3. Outboxへ記録
4. Push
5. サーバーが削除を受理
6. 受理結果を確認後、ローカルtombstoneを物理削除

オフライン中はPush成功までローカルtombstoneを保持する。

## 11. Outbox

未同期変更はOutboxで明示管理する。

- 業務更新とOutbox更新は同一ローカルトランザクション。
- Push対象は `updatedAt > lastPushAt` ではなくOutbox。
- 同一エンティティの未同期変更は原則1件へ集約し、最新状態を保持。
- 集約しても最初の編集元 `baseRevision` を維持。
- Push成功または競合解決成功まで保持。
- 時間による自動削除なし。
- full resyncでもOutboxを保持し、サーバー正本再構築後に再適用する。

候補項目:

```text
id
entityType
entityId
operation
baseRevision
contentHash
payload
createdAt
```

## 12. SyncChangeLog / syncSeq

- `SyncChangeLog` を同期変更履歴の正本とする。
- Box / Item / BoxLocationにも最新の `syncSeq` を保持する。
- レコード更新とSyncChangeLog追加は同一トランザクション。
- `syncSeq` はDB全体で一意・単調増加する64bit符号付き整数。
- Pullは認証済み `userId` で絞り、`syncSeq > cursor` を返す。
- SyncChangeLog保持期間は90日。
- 対象ユーザーについてcursorが保持範囲より古い場合は `FULL_RESYNC_REQUIRED`。
- full resync時はOutboxを保持・再適用する。
- `syncEpoch` は採用しない。

## 13. SyncConflict

SyncConflictは監査履歴ではなく、未解決競合の一時保持領域とする。

候補項目:

```text
id
userId
entityType
entityId
clientBaseRevision
clientContentHash
clientPayload
serverRevisionAtConflict
serverContentHashAtConflict
serverPayloadAtConflict
createdAt
```

同じPushの再送で同じ競合を重複作成しない。
候補一意キー:
`(userId, entityType, entityId, clientBaseRevision, clientContentHash)`

### 13.1 stale SyncConflict

競合解決時に、現在の `server.revision` と `serverRevisionAtConflict` を必ず再比較する。

一致:
- 保存済み競合をそのまま解決可能。

不一致:
- 競合発生後に正本が更新された stale 状態。
- 新しいSyncConflict行は増やさない。
- 既存SyncConflictのserver snapshotを最新正本へ更新する。
- 最新 `contentHash` とclient側を再比較する。

再比較結果:
- 同一 → 実質的に競合解消済みとしてSyncConflict削除、Outboxも成功扱いで削除。
- 不一致 → 最新のclient版 / server版をユーザーへ再提示する。

競合解決時の正本更新、revision更新、serverUpdatedAt更新、syncSeq採番、SyncChangeLog追加、SyncConflict削除は同一トランザクションで行う。

根拠:
- 古いserver snapshotを基準に上書きすると、その後の更新を失う可能性があるため。
- SyncConflictは履歴ではなく未解決状態の保持が目的なので、staleになるたび行を増やす必要がないため。

## 14. トランザクション境界

Pushバッチ全体は巨大トランザクションにしない。
整合性が必要な「論理操作単位」で原子的に処理する。

通常更新:
1. revision確認
2. contentHash比較
3. 正本更新
4. revision更新
5. serverUpdatedAt更新
6. syncSeq採番
7. SyncChangeLog追加
8. commit

Box削除、BoxLocation削除、BoxLocation名後勝ち自動改名など、複数レコードの整合性を伴う操作はそれぞれ一つの論理トランザクションにする。

## 15. ユーザー分離 / 所有権

サーバーは複数ユーザーを保持し、同一ユーザーの複数端末が同一データ集合を同期する。

Box / Item / BoxLocation のサーバー上識別単位:

```text
(userId, id)
```

異なるユーザーは同一 `id` を持ってよい。
Pushの `userId` はpayloadを信用せず認証結果から確定する。

Item→Box、Box→BoxLocationなどの参照も同一userId内に限定する。

## 16. バックアップID / ハッシュ

バックアップは元のIDと同期用と同一の `contentHash` を保持する。

リストア:
- ID不存在 → 元IDで復元
- 同一ID + 同一contentHash → 同一データとしてID維持
- 同一ID + 異なるcontentHash → インポート側へ新ID発行

ID再発行時は参照を同一処理内で再マッピングする。
- `Item.boxId`
- `Box.locationId`
- その他、正式データモデルで確定した参照

`userId` はhashに含めない。バックアップは別ユーザーへ移す用途も許容する。

## 17. Vision / LLM

現行Vision設定を基盤としてv1.0で写真解析本体まで完成させる。

現行主基盤:
- provider: none / openai / claude / gemini
- 暗号化APIキー
- prompt fields
- 設定画面
- get / save / disable / test API

## 18. QR内容

QR payloadは箱コードのみ。

```text
QR payload = Box.code
```

URLは格納しない。

## 19. 現在確認済みの重要な実装差異

1. Prisma Box / Item / BoxLocation に `deletedAt` / `serverUpdatedAt` / `revision` / `syncSeq` がない。
2. Prisma `updatedAt @updatedAt` は要件上の `updatedAt` と意味が一致しない。
3. 現行Pushはrevision/contentHash競合に未対応。
4. 現行Pullはtimestamp `since` ベース。
5. 現行同期はOutboxを持たない。
6. `backup.ts` に `photoThumbs` / `thumbs` 不整合。
7. backup対象にBoxLocationがない。
8. replace restoreがIDを無条件再発行する。
9. 現行Box削除はローカル物理削除。
10. 現行PrismaのBox / Item / BoxLocationの `id` は全ユーザー共通主キー。
11. 現行Pushは `where: { id }` でupsertし、update時にuserIdも書き換えるため所有権侵害リスクがある。
12. 現行BoxLocationは `boxId` を持つBox従属モデルで、確定要件と逆方向。
13. 現行Boxは自由文字列 `location` を持つが、確定要件では `locationId` 参照へ変更が必要。

## 20. 要件ID体系

- REQ-BOX-xxx
- REQ-ITEM-xxx
- REQ-REG-xxx
- REQ-PHOTO-xxx
- REQ-LOC-xxx
- REQ-QR-xxx
- REQ-SEARCH-xxx
- REQ-OFFLINE-xxx
- REQ-SYNC-xxx
- REQ-BACKUP-xxx
- REQ-PRINT-xxx
- REQ-AUTH-xxx
- REQ-VISION-xxx
- REQ-NFR-xxx
