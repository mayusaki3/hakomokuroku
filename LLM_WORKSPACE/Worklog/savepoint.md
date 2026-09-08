# 箱目録 作業 SavePoint

更新: 2026-09-08
対象リポジトリ: `mayusaki3/hakomokuroku`
作業ブランチ: `develop`

## 1. 作業目的

箱目録を完成させる。HLDocS v0.7.0 は作業管理・仕様整理に利用するが、HLDocS自体の未完成・不整合を箱目録完成のブロッカーにしない。

## 2. 作業原則

機能単位で原則として、要件確認 → 利用者確認 → 設計 → 利用者確認 → テストケース → 利用者確認 → テストコード → 実装 → 検証の順で進める。重要な設計判断点では利用者確認を行う。

## 3. 現在位置

### 完了
- 現行 `develop` の機能棚卸し
- v0.8 / v1.0 リリース区分決定
- 主要要件ドラフト整理
- UNC-001 ～ UNC-007 の方針確定
- アイテム「取り出す」と「削除する」の要件追加
- LLM_WORKSPACE初期化
- 同期時刻の責務分離
- `revision` / `baseRevision` による競合検出方針
- `syncSeq` / `SyncChangeLog` による差分Pull方針
- tombstone保持方針
- `SyncConflict` による競合一時保持・再送冪等性方針
- `contentHash` の対象・除外・正規化方針
- `SyncChangeLog` 90日、tombstone 30日、古いcursorは `FULL_RESYNC_REQUIRED`
- `SyncConflict` は未解決中のみ保持し、解決成功時に削除
- トランザクション境界はAPI単位ではなく論理操作単位。Pushバッチ全体は非原子的

### 現在実施中
**全体アーキテクチャ / データモデル / 同期設計**

## 4. 主要確定事項

- v0.8 = Vision以外の完成版
- v1.0 = v0.8 + Vision/LLM画像認識
- 登録順序 = 箱登録 → アイテム → 箱写真 → ラベル → 場所
- 写真フィールド = `thumbs`
- QR payload = 箱コードのみ
- アイテム「取り出す」 = `UNASSIGNED` へ移動
- アイテム「削除する」 = `deletedAt` 設定
- 箱削除時のアイテム = `UNASSIGNED` へ移動
- サーバーtombstone保持期間 = 30日
- ローカルtombstone = サーバーが削除を受理するまで保持し、受理後に物理削除
- `updatedAt` = 実データ内容の最終更新日時
- `serverUpdatedAt` = サーバー受理・更新日時
- `revision` = レコード単位のサーバー版番号
- 未同期ローカル = `revision = 0`、初回サーバー登録成功 = `revision = 1`
- `SyncChangeLog` = 同期変更履歴の正本
- 各Box / Item / BoxLocationにも最新 `syncSeq` を保持し、正本と同一トランザクションで更新
- `SyncChangeLog` 保持期間 = 90日
- 端末cursorが保持範囲より古い場合、差分Pullを拒否し `FULL_RESYNC_REQUIRED`
- 競合判定:
  - `baseRevision == server.revision` → 通常更新
  - 不一致かつ `contentHash` 同一 → 実質同一内容
  - 不一致かつ `contentHash` 不一致 → 時刻に関係なくユーザー確認
- `contentHash` = 業務内容 + 削除状態。ID・時刻・同期メタデータは除外。canonical JSON + SHA-256等
- `SyncConflict` は未解決中のみ保持し、解決成功時に削除
- 競合解決時は最新revisionを再確認し、表示時から進んでいれば最新サーバー版との比較へ戻す
- トランザクション境界 = 整合性を保つ必要がある論理操作単位
- 通常更新では、revision確認 → データ更新 → revision更新 → serverUpdatedAt更新 → syncSeq採番 → SyncChangeLog追加を原子的に実行
- 箱削除では、子ItemのUNASSIGNED移動、各Item更新、BoxLocation tombstone、Box tombstone、各SyncChangeLog追加を一つの論理操作として原子的に実行
- Pushバッチ全体は巨大トランザクションにせず、各論理操作ごとに成功/競合/失敗を返す
- 競合発生時の `SyncConflict` 作成も競合判定と同一トランザクション
- 競合解決時の正本更新・revision/syncSeq/SyncChangeLog更新・SyncConflict削除も同一トランザクション
- バックアップIDを維持し、データ単位ハッシュで衝突判定
- Vision = 現行実装をベースに完成させる
- 高度なテーマ機能の追加開発は不要

## 5. syncSeq 方針検討

候補はDB全体で一意・単調増加する64bit符号付き整数。

根拠:
- SQLite `INTEGER` は64bit符号付き整数で、最大値は 9,223,372,036,854,775,807。
- 仮に毎秒100万件を採番しても最大値到達まで約29万年を要するため、通常運用でのオーバーフローは実質的に発生しない。
- ユーザー別カウンタを持たずに済み、Box / Item / BoxLocationを同一時系列で扱える。

オーバーフロー等で `syncSeq` を再初期化する非常時は、端末アクセスを停止したうえで既存端末の同期情報・cursorをすべて破棄し、SyncChangeLogおよびレコード側syncSeqを再構築して0から採番し直す。復旧後の端末は新規同期状態としてfull resyncする。この運用では旧cursorとの世代判定が不要なため `syncEpoch` は採用しない。

`syncSeq` は通常運用中にロールオーバーしない。非常時の0リセットは通常同期処理ではなく管理上の全同期状態再初期化として扱う。

## 6. 現行実装で確認済みの主要問題

1. Prisma Box / Item / BoxLocation に `deletedAt` / `serverUpdatedAt` / `revision` / `syncSeq` がない。
2. Prisma `updatedAt @updatedAt` は要件上の `updatedAt` と意味が一致しない。
3. Sync Pushは受信レコードを比較せずupsertする。
4. Sync Pullは `updatedAt > since` ベース。
5. バックアップに `photoThumbs` / `thumbs` 不整合がある。
6. バックアップ対象にBoxLocationがない。
7. replaceリストアがIDを無条件再発行する。
8. 箱削除は現在ローカル物理削除。
9. `UNASSIGNED` 基盤は既に存在する。

## 7. ロードマップ

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

## 8. 次のアクション

`syncSeq` のDB全体グローバル採番方式を正式確定した後、以下を順に決める。

1. full resync時の未同期ローカル変更保護方式（outbox / pending mutation）
2. `UNASSIGNED` のサーバー表現
3. 所有権チェック方式とID衝突時処理
4. バックアップhashと同期`contentHash`の共通化可否
5. BoxLocationを含む削除・同期ライフサイクル

詳細作業記録: `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`

## 9. HLDocS運用上の注意

HLDocS v0.7.0は再構成中。HLDocS仕様の不整合は箱目録作業のブロッカーにせず、必要に応じてフィードバック候補として記録する。
