<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260516-183500Z-JP-INDEX
lang: ja-JP
canonical_title: docs/ja-JP 目次
document_type: index
canonical_document: true
-->

[目次](./README.md) > docs/ja-JP

# 箱目録 日本語ドキュメント

`docs/ja-JP` の正本目次。番号は文書カテゴリの順序を表し、同一階層で重複させない。

## フォルダ構成

| 番号 | フォルダ | 役割 |
|---|---|---|
| 00 | [はじめに](./00_はじめに/) | プロジェクト概要・文書の読み方 |
| 01 | [開発ガイド](./01_開発ガイド/) | 開発フロー・規約・Lint/Format |
| 02 | [アーキテクチャ](./02_アーキテクチャ/) | 全体構成・DB・認証等 |
| 03 | [テスト方針](./03_テスト方針/) | テスト戦略・UT/API/E2E方針 |
| 04 | [API仕様](./04_API仕様/README.md) | API・ライブラリ仕様 |
| 05 | [テストケース集](./05_テストケース集/README.md) | API・ライブラリのテストケース |
| 06 | [ロードマップ](./06_ロードマップ/) | 開発・再確認ロードマップ |
| 07 | [HLDocS検証](./07_HLDocS検証/README.md) | HLDocS validator仕様・検証 |

## API仕様の分類

- `00_ライブラリ`: 共通ライブラリ
- `01_ユーザー認証API`: 認証/TOTP/token
- `02_設定API`: ユーザー設定・テーマ設定
- `03_ユーザー情報API`: ユーザー情報固有API

テストケース集は原則としてAPI仕様と同じ分類番号を使用する。

## 文書管理

- この `README.md` を `docs/ja-JP` の正本目次とする。
- `目次.md` は旧リンク互換用。新規リンクでは使用しない。
- 作業途中の設計判断は `LLM_WORKSPACE/Worklog` に置き、確定後に `docs` へ反映する。
- 同一APIの正本仕様を複数フォルダへ重複配置しない。
- Git履歴で参照できる旧仕様を `docs` 内へ複製保存しない。

[目次](./README.md) > docs/ja-JP
