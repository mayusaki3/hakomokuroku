# 箱目録 作業 SavePoint

更新: 2026-09-08
対象リポジトリ: `mayusaki3/hakomokuroku`
作業ブランチ: `develop`

## 1. 作業目的

箱目録を完成させる。
HLDocS v0.7.0 は作業管理・仕様整理に利用するが、HLDocS自体の未完成・不整合を箱目録完成のブロッカーにしない。
箱目録での実利用から得られた問題はHLDocSへのフィードバック候補とする。

## 2. 作業原則

機能単位で原則として次の順に進める。

1. 要件確認
2. 利用者確認
3. 設計
4. 利用者確認
5. テストケース
6. 利用者確認
7. テストコード
8. 実装
9. 検証

重要な設計判断点では利用者確認を行う。

## 3. 現在位置

### 完了
- 現行 `develop` の機能棚卸し
- v0.8 / v1.0 リリース区分決定
- 主要要件ドラフト整理
- UNC-001 ～ UNC-007 の方針確定
- アイテム「取り出す」と「削除する」の要件追加
- LLM_WORKSPACE初期化
- 同期時刻の責務分離方針確定
  - `updatedAt` = データ内容の最終更新日時
  - `serverUpdatedAt` = サーバーがそのレコードを最後に受信・更新した日時
  - `deletedAt` = 論理削除日時
- 同期競合検出用 `revision` 採用確定
- Pull差分カーソル用 `syncSeq` 採用確定
- `SyncChangeLog` を同期変更履歴の正とし、各レコードにも最新 `syncSeq` を保持する方式で確定
- サーバーtombstone保持期間 = 30日
- ローカルtombstone = サーバーが削除を受理するまで保持し、受理後は物理削除
- `baseRevision` 不一致かつ `contentHash` 不一致は時刻に関係なくユーザー確認とする方針で確定
- 未同期ローカルレコードは `revision = 0`、初回サーバー登録成功時に `revision = 1` とする方針で確定
- `SyncConflict` を競合一時バッファ兼再送冪等性管理として使用する方針で確定
- 競合解決要求時に現在の `revision` を再確認し、競合表示時点から進んでいれば最新サーバー版と再確認する方針で確定
- `contentHash` は業務内容 + 削除状態を対象とし、ID・時刻・同期メタデータを除外する方針で確定
- `SyncChangeLog` は90日保持、tombstoneは30日保持、保持範囲より古いcursorは差分Pullを拒否して full resync を要求する方針で確定

### 現在実施中
**全体アーキテクチャ / データモデル / 同期設計**

同期メタデータ:
- `createdAt`
- `updatedAt`
- `deletedAt`
- `serverUpdatedAt`
- `revision`
- `contentHash`
- `syncSeq`

役割:
- `revision` = 1レコード単位の競合検出
- `baseRevision` = 端末が編集元としたサーバーrevisionをPush時に提示
- `syncSeq` = サーバー側の変更順序。Pull差分カーソルとして使用
- `SyncChangeLog` = 同期変更履歴の正本。Pullはここを基準に差分取得
- 各業務レコードの `syncSeq` = そのレコードに適用された最新変更のシーケンス
- `SyncConflict` = 未解決クライアント変更の一時保持、再送重複防止、競合発生時点の比較スナップショット

## 4. 確定事項

詳細は `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md` を参照。

重要事項:
- v0.8 = Vision以外の完成版
- v1.0 = v0.8 + Vision/LLM画像認識
- 登録順序 = 箱登録 → アイテム → 箱写真 → ラベル → 場所
- 写真フィールド = `thumbs`
- QR payload = 箱コードのみ
- アイテム「取り出す」 = `UNASSIGNED` へ移動
- アイテム「削除する」 = `deletedAt` 設定
- 箱削除時のアイテム = `UNASSIGNED` へ移動
- 削除伝播 = `deletedAt` による論理削除後、同期完了後に物理削除
- サーバー側tombstoneは30日保持
- ローカル側tombstoneはサーバー削除受理後に物理削除
- `serverUpdatedAt` をサーバー受理日時として採用
- `revision` を同期競合検出用のサーバー版番号として採用
- 未同期ローカルは `revision = 0`、初回サーバー登録成功で `revision = 1`
- Pullカーソルは時刻ではなくサーバー単調増加の `syncSeq` を採用
- `SyncChangeLog` を `syncSeq` の正とし、Box / Item / BoxLocationにも最新 `syncSeq` を保持
- `SyncChangeLog` 保持期間 = 90日
- tombstone 保持期間 = 30日
- 端末cursorが保持中の最古ログより古い場合、差分Pullは実行せず `FULL_RESYNC_REQUIRED` を返す
- full resyncではサーバー正本を基準にローカル全体を再整合するため、すでに物理削除済みの古いtombstoneも問題なく反映できる
- 競合判定:
  - `baseRevision == server.revision` → 通常更新
  - `baseRevision != server.revision` かつ `contentHash` 同一 → 実質同一内容として競合扱いしない
  - `baseRevision != server.revision` かつ `contentHash` 不一致 → `updatedAt` の新旧に関係なくユーザー確認
- `updatedAt` は競合時の補助情報・表示情報として保持するが、自動勝者決定には使わない
- 競合は `SyncConflict` に別保持し、正本を即時上書きしない
- 同一競合の再送は同じ競合として扱い、競合レコードを増殖させない
- 同じentityに複数端末由来の未解決競合が並存することを許容する
- 競合解決時は `serverRevisionAtConflict` と現在のrevisionを比較し、不一致なら最新サーバー版との再確認へ戻す
- `contentHash`:
  - 対象 = 業務内容 + 削除状態
  - `deletedAt` は具体的時刻ではなく active/deleted に正規化して反映
  - 除外 = id / createdAt / updatedAt / deletedAtの具体的時刻 / serverUpdatedAt / revision / syncSeq / contentHash自身
  - 順序に意味のない配列はソートし、JSONキー順も固定した canonical JSON から計算
  - ハッシュ方式は SHA-256 等の決定的ハッシュを使用
- バックアップIDを維持し、データ単位ハッシュで衝突判定
- Vision = 現行実装をベースに完成させる
- 高度なテーマ機能の追加開発は不要

## 5. 現行実装で確認済みの主要問題

1. Prisma Box / Item / BoxLocation に `deletedAt` / `serverUpdatedAt` / `revision` / `syncSeq` がない。
2. Prisma `updatedAt @updatedAt` は要件上の `updatedAt` と意味が一致しないため、設計変更が必要。
3. Sync Pushは現在、受信レコードを比較せずupsertする。
4. Sync Pullは `updatedAt > since` の差分取得であり、`SyncChangeLog.syncSeq` ベースへ変更が必要。
5. バックアップが `thumbs` ではなく `photoThumbs` を参照する箇所がある。
6. バックアップ対象にBoxLocationがない。
7. replaceリストアがIDを無条件再発行する。
8. 箱削除は現在ローカル物理削除。
9. アイテム取り出しに相当する `moveItem(s)` とUNASSIGNED基盤は既に存在する。

## 6. ロードマップ

0. 現状棚卸し — 完了
1. v0.8 / v1.0 要件仕様 — 主要方針確定、正本化は設計と整合後に実施
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

`serverUpdatedAt` + `revision` + `syncSeq` + `SyncChangeLog` + tombstone + `SyncConflict` + `contentHash` 方針を前提に同期プロトコルを確定する。

現在の設計論点:
- `SyncConflict` の解決済みデータ保持期間
- トランザクション境界の正式確定
- `syncSeq` の採番スコープ（DB全体単調増加かユーザー単位か）
- UNASSIGNED のサーバー表現
- 所有権チェック方式

推奨方向:
- `SyncConflict` は未解決中のみ業務上必要。解決後は監査用途として短期間保持するか、即時削除するかを決定する。
- トランザクション境界はAPI全体ではなく整合性が必要な論理操作単位とする。通常更新では「対象レコード確認/更新 + revision更新 + syncSeq採番 + SyncChangeLog追加」を原子的に行う。箱削除では「子ItemをUNASSIGNEDへ移動 + BoxLocation削除tombstone + Box削除tombstone + 各revision/syncSeq/SyncChangeLog」を一つの論理操作として原子的に扱う。Pushバッチ全体は巨大トランザクションにせず、独立操作ごとに成功/競合/失敗を返す。

## 8. 追加作業記録

- `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`
  - v0.8/v1.0要件、UNC確定結果、取り出し/削除、同期、バックアップ等の詳細作業記録。

## 9. HLDocS運用上の注意

使用中のHLDocS v0.7.0は再構成中。
HLDocS仕様の不整合を発見しても、箱目録作業を停止させない。
現在の作業に必要なら箱目録側で局所的に方針を確定し、非ブロッキングならフィードバック候補として扱う。
