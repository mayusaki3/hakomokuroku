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
- revision / baseRevisionによる競合検出
- contentHashによる内容比較
- syncSeq / SyncChangeLogによる差分Pull
- tombstone保持方針
- SyncConflictによる競合一時保持・再送冪等性
- stale SyncConflictの最新化・再比較方針
- SyncConflictは1 entityにつき未解決1件、statusなし
- SyncChangeLog 90日、tombstone 30日、古いcursorはFULL_RESYNC_REQUIRED
- ローカルOutboxとfull resync時の再適用
- 同期中再編集を保護するOutbox snapshot / outboxVersion
- マルチユーザー `(userId,id)` 識別
- Box / BoxLocationそれぞれの予約 `UNASSIGNED`
- BoxLocationを独立したフラットな置き場所マスタとする方針
- BoxLocation.nameのユーザー内一意・後勝ち自動改名
- BoxLocation.nameのtrim + Unicode NFC正規化
- BoxLocationを `id / name / note / thumbs + 共通同期メタデータ` とする方針
- BoxLocation写真はv1.0 Vision対象外
- バックアップhashを同期contentHashと共通化
- 通常バックアップはactiveな論理データのみを対象とし、tombstone・Outbox・SyncConflict・SyncChangeLog・cursor等の同期内部状態を含めない
- ローカルIndexedDBをログインユーザーごとに分離する方針
- IndexedDB分離キーとして既存Prisma `User.id` の不変IDを使用する方針
- 新DB名を概念上 `hk-local-v2-<User.id>` とし、旧 `hk-local-v1` は移行せず破棄可能とする方針
- オフライン利用はオンライン認証成功後の実行セッション中のみ許可
- アプリ終了後は再度オンライン認証必須
- オフライン中の変更はOutboxへ保持し、次回オンライン認証成功直後に同期
- 通常同期順序を `Pull → Push → Pull` とする方針
- 初回同期中は閲覧可・編集不可、通信系失敗時はOFFLINE_READYへ移行して編集可
- 通信復旧時は自動同期、手動同期ボタンをフォールバックとして持つ
- 認証状態・通信状態・同期状態・利用フェーズを分離して管理する方針
- 通信系エラーと認証・データ・競合エラーを分離する方針
- PullはsyncSeqでページングし、各ページのローカル適用成功後だけcursorを進める方針

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
- 基本項目: `id`, `name`, `note`, `thumbs` + 共通同期メタデータ
- `meta`, `aiState`, `aiUpdatedAt` はBoxLocation固有項目として持たせない
- codeは持たない
- v1.0 Vision対象は箱写真・アイテム写真とし、場所写真は対象外
- nameはユーザー内一意
- nameは前後空白trim後にUnicode NFC正規化し、大小文字は区別、内部空白等は保持
- UNASSIGNED予約判定も同じ正規化後の値で行う
- 同名発生時は後からサーバー受理する名称を優先し、既存側を `name(n)` へ自動改名
- nは未使用の最小正整数
- suffixは正規化済み名称全体へ追加し、既存末尾 `(n)` は解析・除去しない
- 後勝ちはupdatedAtではなくサーバー受理順
- 自動改名は通常の業務更新としてrevision/contentHash/syncSeq等を更新し、新規/変更側の保存と同一トランザクション
- UNASSIGNEDは予約名で通常レコードには使用不可

根拠:
- BoxLocationの目的は「どの部屋・棚等に箱があるか」を表すことで、階層管理自体は目的ではない。
- フラット構造なら登録・移動・削除・同期・バックアップ・UIを単純化できる。
- 引っ越しでは箱詰め時点で置き場所未定が通常なのでUNASSIGNEDを通常状態として扱う。
- 場所写真は確認用途として保持するが、Vision対象まで広げるとv1.0の実装・プロンプト・テスト範囲が増える割に主要用途への効果が小さい。

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
`baseRevision` はPush/クライアント同期状態として扱う。

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

### SyncConflict
- 監査履歴ではなく未解決競合の一時保持領域
- `(userId, entityType, entityId)` ごとに未解決1行のみ
- statusは持たない
- 解決時は行を削除
- 同じPush再送は同じconflictIdを返す
- 最新client候補が再送された場合は同じ行を更新する
- client勝ち時は正本更新 + revision + syncSeq + SyncChangeLog + conflict削除を原子的に実行
- server勝ち時は正本を変更せずconflictを削除

### stale SyncConflict
- 解決時にcurrent server revisionとserverRevisionAtConflictを再確認
- 同じなら通常解決
- 進んでいれば既存SyncConflictのserver snapshotを最新正本へ更新
- 新しいSyncConflict行は増やさない
- 最新contentHashで再比較
- 同一なら自動解消しSyncConflictを削除し、該当Outbox snapshotを成功扱い
- 不一致なら最新client/server版を再提示
- 古いsnapshotによる上書きを禁止

### SyncChangeLog / syncSeq
- SyncChangeLogが変更履歴の正本
- syncSeqはDB全体で一意・単調増加する64bit符号付き整数
- PullはuserIdで絞り `syncSeq > cursor`
- SyncChangeLog保持90日
- stale cursorはFULL_RESYNC_REQUIRED
- cursor有効性は対象ユーザーの保持ログで判断
- syncEpochなし
- record更新とchange log追加は同一トランザクション

### Pullページング / cursor
Pull response概念:

```text
changes[]
nextCursor
hasMore
```

- syncSeq順でページングする
- 1ページの固定上限を設ける（初期候補500件程度）
- cursorはレスポンス受信時には更新しない
- そのページのIndexedDBへの適用が正常完了した後にだけ `cursor = nextCursor` とする
- ローカル適用失敗時は旧cursorを維持し、同じ変更を再取得可能にする
- ページ適用とcursor更新は可能な限り同一ローカルトランザクション境界で扱う

根拠:
- 取得済みだが保存できなかった変更の取りこぼしを防ぐため。
- SyncChangeLogが大量でもレスポンスサイズを制御できるため。

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
- 各entityのOutboxにdevice-local単調増加 `outboxVersion` を持つ
- 同期開始時に送信対象Outboxをsnapshot化する
- Push成功時、現在のOutbox.outboxVersionが送信snapshotと一致する場合のみ削除する
- 同期中に再編集されversionが進んでいた場合、新しいOutboxを保持する
- 先行version成功で返ったserver revisionを、後続versionのbaseRevisionへ安全に前進させることができる
- entityIdだけを条件にPush成功後のOutboxを削除してはならない

### contentHash
- 業務内容 + active/deleted状態をhash対象
- ID/userId/各種時刻/revision/syncSeq/contentHash自身は除外
- deletedAtは時刻値ではなく削除状態だけ反映
- 順序非依存配列はソート
- object key順を決定化
- canonical JSON + SHA-256等

### backup
- 同期と完全に同じcontentHashアルゴリズムを利用
- 元IDを維持
- 同一ID+同一hashは同一データ
- 同一ID+異なるhashはimport側へ新IDを発行し参照を再マッピング
- 通常バックアップは `deletedAt == null` の現在有効な論理データのみを含む
- tombstoneは含めない
- Outbox / SyncConflict / SyncChangeLog / sync cursor / revision / syncSeq等の同期内部状態は含めない
- リストアされたデータは移行先の通常データとして扱い、同期状態は移行先で再構築する

### ユーザー分離
- サーバー上の業務レコード識別 = `(userId,id)`
- ここでサーバー内部ユーザー識別には既存Prisma `User.id` を用いる
- ログイン用 `User.userId` と内部 `User.id` を仕様上明確に区別する
- 同一ユーザー複数端末は同一データ空間
- 異なるユーザーは同一id可
- PushのuserIdはpayloadではなく認証結果から確定

### ローカルユーザー分離
- 1つのIndexedDBをuserId列で共有せず、ログインユーザーごとにIndexedDB自体を分離する
- DB分離キーには既存Prisma `User.id` を使用する
- 新DB名の概念: `hk-local-v2-<User.id>`
- 旧固定DB `hk-local-v1` の現データは破棄可能で、移行処理を実装しない
- 旧DBが残存していても新実装では読み取らない
- boxes / items / boxLocations / tags / Outbox / sync cursor等はユーザー専用DB/状態に保持
- ログアウトしてもユーザー専用DBは削除せず、再ログイン時に再利用
- 別ユーザーへログインした場合は別DBを開き、前ユーザーのローカルデータを参照・Pushしない

### オフライン利用と再認証
- オフライン利用は、その起動中にオンライン認証へ成功したユーザーだけに許可
- オンライン認証成功後は、通信断になっても同じ実行セッション中であればローカルDBを利用可能
- アプリ終了・再起動後はオンライン認証成功まで利用不可
- オフライン用PINや永続オフライン認証情報は持たない
- オフライン中の登録・変更・削除はOutboxへ記録
- アプリ終了時も未同期データとOutboxは削除しない

### 通常同期サイクル

```text
オンライン認証成功
  ↓
Pull
  ↓
ローカルOutbox再適用
  ↓
Push
  ↓
Pull
  ↓
同期完了
```

- 最初のPullで他端末・サーバー側の最新変更を取得
- Pull適用後もOutboxを保持し未同期ローカル変更を再適用
- PushではbaseRevision/revision/contentHashによる競合判定
- 最後のPullでPush結果・BoxLocation自動改名・server revision/syncSeq等を反映
- FULL_RESYNC_REQUIRED時はOutbox保持 → Full Resync → Outbox再適用 → Push → 最終Pull

### 状態管理
1つの巨大な複合状態機械にはせず、責務を分離する。

認証状態:
```text
LOCKED
AUTHENTICATED
```

通信状態:
```text
ONLINE
OFFLINE
```

同期状態:
```text
IDLE
SYNCING
SYNC_ERROR
CONFLICT
```

利用フェーズ:
```text
LOCKED
INITIAL_SYNC
READY
OFFLINE_READY
```

操作可否:
- LOCKED: 閲覧不可、編集不可
- INITIAL_SYNC: 閲覧・検索可、登録・編集・削除不可
- READY: 閲覧・編集可
- OFFLINE_READY: 閲覧・編集可
- 初回以外のSYNCING / SYNC_ERROR / CONFLICTでは原則として通常操作を継続可能

初回同期:
```text
LOCKED
  ↓ online auth success
INITIAL_SYNC
  ├─ sync success → READY
  ├─ 通信系失敗 → OFFLINE_READY
  ├─ 401/403 → 認証再評価、必要ならLOCKED
  ├─ データ不正/整合性エラー → 編集を解放せず初回同期エラー
  └─ conflict → CONFLICT保持、アプリ全体はブロックしない
```

通信復旧:
```text
OFFLINE_READY
  ↓ ONLINE検出
SYNCING
  ↓ Pull → Push → Pull
READY
```

- 通信復旧時は自動同期
- 手動同期ボタンをフォールバックとして用意

### エラー分類
OFFLINE系へ扱う一時障害:
- ネットワーク断
- DNS失敗
- timeout
- connection refused
- 5xx等の一時的サーバー到達不能

OFFLINE扱いにしない:
- 401 / 403
- 入力不正
- データ整合性エラー
- 仕様上のエラー
- 競合

401/403は認証再評価、競合はCONFLICTとして保持する。

## 5. 現行実装の主要差異

1. Prisma Box / Item / BoxLocationに同期メタデータが不足。
2. Prisma `updatedAt @updatedAt` は確定したupdatedAt意味と不一致。
3. Pushはrevision/contentHash競合未対応。
4. Pullはtimestamp since方式。
5. PullのsyncSeqページング・適用成功後cursor更新が未実装。
6. Outbox未実装。
7. Outbox snapshot / outboxVersion未実装。
8. backupのphotoThumbs/thumbs不整合。
9. backupにBoxLocationなし。
10. backupが確定したactive-only / sync内部状態除外方式になっていない。
11. replace restoreがIDを無条件再発行。
12. Box削除がローカル物理削除。
13. PrismaのBox / Item / BoxLocation idが全ユーザー共通PK。
14. Push `where:{id}` + userId書換えに所有権侵害リスク。
15. 現行BoxLocationはboxIdを持つBox従属モデルだが、確定要件では独立マスタ。
16. 現行Box.location自由文字列は `locationId` 参照へ変更が必要。
17. 現行BoxLocationのmeta/AI関連項目は確定モデルと不一致。
18. 現行Dexieは固定DB名 `hk-local-v1` を全ユーザーで共有する構造であり、ユーザー別 `hk-local-v2-<User.id>` への変更が必要。
19. 旧 `hk-local-v1` の移行処理は不要。
20. オフライン再起動時に認証なしでユーザーDBを開く方式は採用しない。
21. 現行同期は `Pull → Push → Pull` とOutbox再適用を前提とした同期サイクルになっていない。
22. 認証・通信・同期・利用フェーズの分離状態管理が未実装。

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
**Push APIのレスポンス形式・部分成功・再送冪等性を確定する。**

論理操作単位で独立処理する既決方針に合わせ、Pushバッチ全体をall-or-nothingにはせず、各Outbox snapshotごとに成功・競合・失敗を返す方式を検討する。

詳細作業記録: `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`

## 8. HLDocS運用上の注意

HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
