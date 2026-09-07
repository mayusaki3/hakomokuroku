# 箱目録 作業 SavePoint

更新: 2026-09-07
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

### 現在実施中
**全体アーキテクチャ / データモデル / 同期設計**

特に以下を設計する。
- Dexie ↔ Sync API ↔ Prisma の責務
- Box / Item / BoxLocation の正式データ構造
- `createdAt` / `updatedAt` / `serverUpdatedAt` / `deletedAt`
- 仮置き箱 `UNASSIGNED`
- アイテム取り出し
- 論理削除と物理削除
- 複数端末同期
- `updatedAt` 同時刻競合とユーザー確認
- バックアップのID・ハッシュ

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
- 同期競合 = `updatedAt` 比較。同時刻で内容が異なる場合はユーザー確認
- `serverUpdatedAt` を差分同期用のサーバー時刻として採用
- バックアップIDを維持し、データ単位ハッシュで衝突判定
- Vision = 現行実装をベースに完成させる
- 高度なテーマ機能の追加開発は不要

## 5. 現行実装で確認済みの主要問題

1. Prisma Box / Item / BoxLocation に `deletedAt` / `serverUpdatedAt` がない。
2. Prisma `updatedAt @updatedAt` は要件上の `updatedAt` と意味が一致しないため、設計変更が必要。
3. Sync Pushは現在、受信レコードを比較せずupsertする。
4. Sync Pullは `updatedAt > since` の差分取得であり、`serverUpdatedAt` ベースへ変更が必要。
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

`serverUpdatedAt` 採用を前提に、正式な同期アーキテクチャ案を作成する。

次の設計論点:
- 端末時計ずれを許容しつつ `updatedAt` を競合判定に使う方法
- 同一 `updatedAt` かつ内容差異時の競合レコード保持方法
- `deletedAt` 論理削除をいつ物理削除可能と判定するか
- Pullカーソルを `serverUpdatedAt` だけで安全に扱うか、タイブレーカーを追加するか

これらを整理した時点で、次の利用者判断点を提示する。

## 8. 追加作業記録

- `LLM_WORKSPACE/Worklog/requirements-v0.8-v1.0.md`
  - v0.8/v1.0要件、UNC確定結果、取り出し/削除、同期、バックアップ等の詳細作業記録。

## 9. HLDocS運用上の注意

使用中のHLDocS v0.7.0は再構成中。
HLDocS仕様の不整合を発見しても、箱目録作業を停止させない。
現在の作業に必要なら箱目録側で局所的に方針を確定し、非ブロッキングならフィードバック候補として扱う。
