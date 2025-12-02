[目次](../../目次.md) > 開発ガイド > フロントエンド(apps/web) > Lint / Format

# フロントエンド(apps/web) の Lint / Format 運用ルール

このドキュメントは、`apps/web`（Next.js アプリ）の Lint / Format 運用方法をまとめたものです。  
配置想定パス: `docs/ja-JP/01_開発ガイド/40_Lint_Format運用.md`（ファイル名は目安）

## 1. 使用ツールと設定ファイル

- Lint:
  - ツール: ESLint (`next lint`)
  - 設定: `.eslintrc.cjs`
  - Next.js 推奨設定 + a11y / React Hooks などを利用
- Format:
  - ツール: Prettier
  - 設定: `.prettierrc.json`
  - 対象拡張子: `.ts`, `.tsx`, `.js`, `.json`, `.css`, `.html`, `.md`, `.mts` など（`prettier --write .` で一括管理）
- 除外:
  - ビルド成果物やキャッシュは `.prettierignore` / `.gitignore` で除外する

## 2. npm scripts（apps/web/package.json）

`apps/web/package.json` における Lint / Format 用スクリプトは以下とする。

```jsonc
{
  "scripts": {
    "lint": "next lint",
    "format": "prettier --check .",
    "format:write": "prettier --write ."
  }
}
```

- `pnpm -C apps/web lint`  
  Next.js 標準の ESLint チェックを実行する。
- `pnpm -C apps/web format`  
  Prettier によるフォーマットチェック（差分があるとエラー終了）。
- `pnpm -C apps/web format:write`  
  Prettier による自動整形（対象ファイルを書き換える）。

## 3. 開発時の基本ワークフロー

### 3-1. コード修正前後

1. 修正前に（任意・必要に応じて）フォーマットを揃えたい場合:
   - `pnpm -C apps/web format:write`
2. コード修正を行う。
3. 修正後に以下を順番に実行する:
   - フォーマットチェック:  
     `pnpm -C apps/web format`
   - Lint チェック:  
     `pnpm -C apps/web lint`
   - （必要に応じて）テスト＋カバレッジ:  
     `pnpm -C apps/web exec vitest --run --coverage --config vitest.config.mts`

### 3-2. Lint の注意点

Lint 実行時に出る代表的な警告:

- `@next/next/no-img-element`
  - `<img>` 直書き利用への警告。
  - 可能な限り `next/image` の `<Image>` コンポーネントに置き換える。
  - 例外的に `<img>` を使う場合は、ルール個別無効化コメント等で対応する（必要になった時点で検討）。

- `jsx-a11y/alt-text`
  - `<img>` などに `alt` 属性が必須。
  - UI上で意味を持たない場合は `alt=""` を明示的に設定する。

React Hooks 系:

- `react-hooks/exhaustive-deps`
  - `useEffect` の依存配列に関する警告。
  - 原則として:
    - 実際に参照している関数・変数は依存配列に含める。
    - 依存を増やしたくない場合は `useCallback` 等を使って関数を安定化させる。
    - 意図的に無視する場合はコメントでルール無効化＋理由を記載する。

## 4. Prettier の運用ポリシー

- `apps/web` 以下の**人手で管理するコード／設定ファイルは原則すべて Prettier 対象**とする。
- 生成物やビルド成果物、外部ツールが強くスタイルを持つファイルは、必要に応じて `.prettierignore` で除外する。
- 既に整形済み状態（`pnpm -C apps/web format` が成功）を基本状態とし、以後の PR / コミットでは:
  - 差分ファイルに対して `format:write` を実行する。
  - コミット前に `format`（check）で崩れがないことを確認する。

## 5. CI での利用想定

CI 側では、次のような順番で実行する想定。

1. `pnpm -C apps/web format`（Prettier チェック）
2. `pnpm -C apps/web lint`（ESLint）
3. `pnpm -C apps/web exec vitest --run --coverage --config vitest.config.mts`（テスト＋カバレッジ）

- `format` が失敗した場合は「開発者側で `format:write` を実行してから再コミットする」のが基本運用とする。
- Lint / Format とテストの結果がすべて OK になっている状態で PR を出す。

## 6. Lint / Format 追加・変更時のルール

- 新しいルールを `.eslintrc.cjs` / `.prettierrc.json` に追加・変更する場合:
  - 影響範囲を把握するため、ローカルで `pnpm -C apps/web format:write` を一度実行し、差分を確認する。
  - 既存コードが大きく変わる場合は、コミットを分ける（例:  
    - `chore(web): run prettier`  
    - `feat(web): xxx の実装`
    など）。
- プロジェクト全体のスタイルを変えるような設定変更（インデント幅やクォートなど）は、事前に相談した上で行う。

---
[目次](../../目次.md) > 開発ガイド > フロントエンド(apps/web) > Lint / Format
