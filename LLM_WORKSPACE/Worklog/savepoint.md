# 箱目録 作業 SavePoint

更新: 2026-09-08
対象リポジトリ: `mayusaki3/hakomokuroku`
作業ブランチ: `develop`

## 1. 作業目的

箱目録を完成させる。HLDocS v0.7.0 は作業管理・仕様整理に利用するが、HLDocS自体の未完成・不整合を箱目録完成のブロッカーにしない。

## 2. 作業原則

機能単位で原則として、要件確認 → 利用者確認 → 設計 → 利用者確認 → テストケース → 利用者確認 → テストコード → 実装 → 検証の順で進める。重要な設計判断点では利用者確認を行う。仕様には判断結果だけでなく根拠も記録する。

## 3. 現在位置

### 完了
- 現行 `develop` の機能棚卸し
- v0.8 / v1.0 リリース区分決定
- 主要要件ドラフト整理
- アイテム「取り出す」と「削除する」の区別
- 同期時刻の責務分離
- revision / baseRevisionによる競合検出
- contentHashによる内容比較
- syncSeq / SyncChangeLogによる差分Pull
- tombstone保持方針
- SyncConflictによる競合一時保持・再送冪等性
- stale SyncConflictの最新化・再比較方針
- SyncChangeLog 90日、tombstone 30日、古いcursorはFULL_RESYNC_REQUIRED
- ローカルOutboxとfull resync時の再適用
- マルチユーザー `(userId,id)` 識別
- Box / BoxLocationそれぞれの予約 `UNASSIGNED`
- BoxLocationを独立したフラットな置き場所マスタとする方針
- BoxLocation.nameのユーザー内一意・後勝ち自動改名
- バックアップhashを同期contentHashと共通化
- ローカルIndexedDBをログインユーザーごとに分離する方針
- IndexedDB分離キーとして既存Prisma `User.id` の不変IDを使用する方針
- オフライン利用はオンライン認証成功後の実行セッション中のみ許可
- アプリ終了後は再度オンライン認証必須
- オフライン中の変更はOutboxへ保持し、次回オンライン認証成功直後に同期

### 現在実施中
**全体アーキテクチャ / データモデル / 同期設計**

## 4. 主要確定事項

### リリース
- v0.8 = Vision以外の完成版
- v1.0 = v0.8 + Vision/LLM画像認識
- 高度なテーマ機能の追加開発は不要

### 登録・QR・写真
- 登録順序 = 箱登録 → アイテム → 箱写真 → ラベル → 場所
- 場所は未設定のまま完了可能
- 写真フィールド = `thumbs`
- QR payload = Box.codeのみ

### Box / Item
- Item「取り出す」 = `boxId=UNASSIGNED`
- Item「削除する」 = tombstone化
- Box削除 = 子ItemをUNASSIGNEDへ移動後、Boxをtombstone化
- Box削除ではBoxLocationを削除しない
- UNASSIGNED Boxは予約レコードで通常削除・編集不可

### BoxLocation
- 独立した置き場所マスタ
- 階層なし
- Box : BoxLocation = 多対1
- Boxが `locationId` で参照
- 新規Boxは `locationId=UNASSIGNED`
- UNASSIGNED BoxLocationは予約レコードで通常削除・編集不可
- BoxLocation削除 = 参照BoxをUNASSIGNEDへ移動後、場所をtombstone化
- 基本項目: id, name, note, thumbs, meta, aiState, aiUpdatedAt + 共通同期メタデータ
- codeは持たない
- nameはユーザー内一意
- 同名発生時は後からサーバー受理する名称を優先し、既存側を `name(n)` へ自動改名
- nは未使用の最小正整数
- 後勝ちはupdatedAtではなくサーバー受理順
- 自動改名は通常の業務更新としてrevision/contentHash/syncSeq等を更新し、新規/変更側の保存と同一トランザクション
- UNASSIGNEDは予約名で通常レコードには使用不可

根拠:
- BoxLocationの目的は「どの部屋・棚等に箱があるか」を表すことで、階層管理自体は目的ではない。
- フラット構造なら登録・移動・削除・同期・バックアップ・UIを単純化できる。
- 引っ越しでは箱詰め時点で置き場所未定が通常なのでUNASSIGNEDを通常状態として扱う。
- 名前一意により階層なしでも選択肢を識別できる。
- 同名時の後勝ち自動改名により、複数端末のオフライン作成でもユーザー操作を止めず一意性を維持できる。

### 同期メタデータ
Box / Item / BoxLocation:
- createdAt
- updatedAt
- deletedAt
- serverUpdatedAt
- revision
- contentHash
- syncSeq

未同期新規 = revision 0、初回サーバー登録成功 = revision 1。

### 競合
```text
baseRevision == server.revision
→ 通常更新

baseRevision != server.revision
→ contentHash比較
  同一 → 実質同一内容
  不一致 → ユーザー確認
```

updatedAtは競合勝者決定には使用しない。

### stale SyncConflict
- 解決時にcurrent server revisionとserverRevisionAtConflictを再確認
- 同じなら通常解決
- 進んでいれば既存SyncConflictのserver snapshotを最新正本へ更新
- 新しいSyncConflict行は増やさない
- 最新contentHashで再比較
- 同一なら自動解消しSyncConflictとOutboxを削除
- 不一致なら最新client/server版を再提示
- 古いsnapshotによる上書きを禁止

根拠:
- 競合表示後に別端末更新が入ってもデータを失わないため。
- SyncConflictは監査履歴ではなく未解決状態の保持領域なのでstaleごとに履歴行を増やす必要がないため。

### SyncChangeLog / syncSeq
- SyncChangeLogが変更履歴の正本
- syncSeqはDB全体で一意・単調増加する64bit符号付き整数
- PullはuserIdで絞り `syncSeq > cursor`
- SyncChangeLog保持90日
- stale cursorはFULL_RESYNC_REQUIRED
- syncEpochなし

### 削除
- deletedAtでtombstone化
- サーバーtombstone保持30日
- ローカルtombstoneはサーバー受理まで保持し、受理後物理削除

### Outbox
- 業務更新と同一ローカルトランザクション
- PushはOutbox基準
- 同一entityの未同期変更は最新状態へ集約、最初のbaseRevision維持
- 成功/競合解決まで保持、自動期限削除なし
- full resyncでも保持して再適用

### contentHash / backup
- 業務内容 + active/deleted状態をhash対象
- ID/userId/各種時刻/revision/syncSeq/contentHash自身は除外
- canonical JSON + SHA-256等
- backupの衝突判定も完全に同一アルゴリズム
- backupは元ID維持。同一ID+同一hashは同一、同一ID+異なるhashはimport側へ新ID
- ID変更時はItem.boxId、Box.locationId等を再マッピング

### ユーザー分離
- サーバー上の業務レコード識別 = `(userId,id)`
- 同一ユーザー複数端末は同一データ空間
- 異なるユーザーは同一id可
- PushのuserIdはpayloadではなく認証結果から確定

### ローカルユーザー分離
- 1つのIndexedDBをuserId列で共有せず、ログインユーザーごとにIndexedDB自体を分離する。
- DB分離キーにはサーバー内部の不変ユーザーIDを使用する。
- 現行Prismaには `User.id String @id @default(cuid())` とログイン用 `User.userId String @unique` が既に分離されているため、新しい識別子は追加せず既存 `User.id` を不変IDとして再利用する。
- IndexedDB名の概念例: `hk-local-v1-<User.id>`。
- boxes / items / boxLocations / tags / Outbox / sync cursor等は、そのユーザー専用DBまたはそのユーザー専用同期状態として保持する。
- ログアウトしてもユーザー専用DBは削除せず、再ログイン時に同じDBを再利用する。
- 別ユーザーへログインした場合は別DBを開き、前ユーザーのローカルデータを参照・Pushしない。

根拠:
- ログインIDや表示名が変更されてもローカルDBとの対応を維持できるため。
- 新しいID体系を増やさず既存User主キーを再利用できるため。
- オフライン未同期データをアカウント切替後もユーザーごとに安全に保持するため。
- Outboxやcursorのユーザー取り違えによる誤Pushを防ぎやすいため。

### オフライン利用と再認証
- オフライン利用は、その起動中にオンライン認証へ成功したユーザーだけに許可する。
- オンライン認証成功後は、通信断になっても同じ実行セッション中であればローカルDBを利用できる。
- アプリ終了・再起動後は、ローカルDBが残っていてもオンライン認証に成功するまで利用不可とする。
- オフライン用PINや永続オフライン認証情報は持たない。
- オフライン中の登録・変更・削除はユーザー専用IndexedDBへ保存し、Outboxへ記録する。
- アプリ終了時も未同期データとOutboxは削除しない。
- 次回オンライン認証成功後、認証された `User.id` に対応するIndexedDBを開き、未同期Outboxを同期対象とする。
- 認証されたユーザーと異なるIndexedDB/Outboxは開かず同期しない。

根拠:
- オフラインログイン機構を別途実装せず、オンライン認証をセキュリティ境界として明確にできるため。
- 通信断中の作業継続というPWA要件を維持できるため。
- アプリ終了後も未同期作業を失わず、次回の正規認証後に同期できるため。

## 5. 現行実装の主要差異

1. Prisma Box / Item / BoxLocationに同期メタデータが不足。
2. Prisma `updatedAt @updatedAt` は確定したupdatedAt意味と不一致。
3. Pushはrevision/contentHash競合未対応。
4. Pullはtimestamp since方式。
5. Outbox未実装。
6. backupのphotoThumbs/thumbs不整合。
7. backupにBoxLocationなし。
8. replace restoreがIDを無条件再発行。
9. Box削除がローカル物理削除。
10. PrismaのBox / Item / BoxLocation idが全ユーザー共通PK。
11. Push `where:{id}` + userId書換えに所有権侵害リスク。
12. 現行BoxLocationはboxIdを持つBox従属モデルだが、確定要件では独立マスタ。
13. 現行Box.location自由文字列は `locationId` 参照へ変更が必要。
14. 現行Dexieは固定DB名 `hk-local-v1` を全ユーザーで共有する構造であり、ユーザー別DB分離への変更が必要。
15. オフライン再起動時に認証なしでユーザーDBを開く方式は採用しない。

## 6. ロードマップ

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

## 7. 次のアクション

次の設計判断点:
**オンライン認証成功直後の同期順序をどうするか。**

候補:
1. Push → Pull
   - 端末の未同期Outboxを先にサーバーへ反映し、その後最新サーバー状態を取得する。
2. Pull → Push
   - 先に他端末の最新状態を取得し、その後Outboxを競合判定付きで送る。
3. Pull → Push → Pull
   - 最新サーバー状態を取得してからOutboxを送信し、Push結果や自動改名等を最終Pullで正規化する。

推奨は3。特にBoxLocationの後勝ち自動改名、競合解決、他端末更新を含むため、同期開始時とPush後の両方でサーバー正本を確認するのが最も安全。

詳細作業記録: `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`

## 8. HLDocS運用上の注意

HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
