[目次](../../目次.md) > テストケース集 > APIテストケース集 > /api/user/icon テストケース

# /api/user/icon テストケース

## 1. 対象概要

- 対象エンドポイント: `PUT /api/user/icon`
- 実装ファイル: `apps/web/src/app/api/user/icon/route.ts`
- 主な責務:
  - ログインユーザーのアイコン（`user.iconDataUrl`）を `data:image/png;base64,...` 形式で更新する
  - 入力 `dataURL` の妥当性検証（スキーム / MIME / base64 / 空チェックなど）
  - Prisma による DB 更新結果を元にステータスコード・レスポンスを返却

### 1.1 入出力仕様（要約）

- 入力: JSON ボディ `{ dataURL: string }`
  - `Content-Type: application/json` 必須
  - `dataURL` は `data:image/png;base64,<base64>` 形式のみ許容
- 出力:
  - 成功: `200` + `{ ok: true, me: { id: string } }`
  - 失敗: `4xx/5xx` + `{ ok: false, error: string }`

### 1.2 ステータスコード方針（実装準拠）

- 認証系
  - 未ログイン / 認証エラー: `401`
- 入力バリデーション系
  - JSON / Content-Type 不正: `400`
  - `dataURL` フォーマット不正: `400`
- DB 更新系
  - 対象レコードなし（Prisma の not found 相当）: `404`
  - 既知以外の DB エラー: `500`
- 内部エラー系
  - 想定外の例外: `500`

## 2. テスト前提・モック方針

### 2.1 共通モック

- 認証:
  - `@/server/auth` の `requireUserId` を `vi.mock` でモック
  - 正常系では `'U1'` など固定ユーザー ID を返却
  - 未ログイン / 例外ケースでは `null` 返却や例外送出でシナリオを切替
- DB:
  - `@/lib/db`（`prisma`）をモック
  - `prisma.user.update` の戻り値・例外をテストごとに調整
  - `updateMany` 相当の戻り値 `{ count: number }` もテスト用に使用

### 2.2 Hook / spy 前提

- ルートファイル側で以下を公開:
  - `export function parseAndNormalizeDataURL(...)`
  - `export async function updateUserIcon(...)`
  - `export const __hooks = { requireUserId, parseAndNormalizeDataURL, updateUserIcon }`
- hook-smoke テストでは、`vitest.spyOn` を `mod.parseAndNormalizeDataURL` に対して実施し、
  実際の `PUT` 実行時に 1 回だけ呼ばれることを検証する。

## 3. テスト観点分類

1. 正常系
   - N01: ログイン済み + 正常な `dataURL` で 200 + `{ ok:true, me }`
2. 認証系
   - A1x: 未ログイン（`requireUserId` が `null` 等）で 401
   - A2x: 認証処理中に例外が発生するケースで 401
3. 入力バリデーション（ヘッダー / JSON / dataURL）
   - B1x: Content-Type 不正（`application/json` 以外）
   - B2x: JSON 解析失敗
   - B3x: `dataURL` 未指定、文字列以外、不正フォーマット、不正 MIME、base64 不正、base64 空など
4. DB 更新結果
   - C1x: 通常の `update` 成功
   - C2x: `update` が「対象なし」系エラー（P2025 等）→ 404
   - C3x: `updateMany` 相当で `count === 0` → 404
5. 例外系
   - D1x: DB 例外（but not not-found）→ 500
   - D2x: 内部で予期せぬ例外発生 → 500
6. Hook / 結合スモーク
   - H01: `PUT` 実行時に `parseAndNormalizeDataURL` が 1 回呼ばれていること

## 4. テストケース一覧

### 4.1 ID 命名規則

- 本エンドポイント専用 ID: `API-USERICON-xx`
  - `xx` は 01 から連番
- 正常系・異常系が混在するため、`区分` 列で種別を明記

### 4.2 テストケース詳細

#### API-USERICON-01（正常: アイコン更新成功）

- 区分: 正常
- 観点:
  - ログイン済みユーザーが正しい `dataURL` を送信した場合、`200` + `{ ok:true, me }` が返ること
- 前提:
  - `requireUserId` → `'U1'` を返却
  - `prisma.user.update` → `{ id: 'U1', displayName: ..., iconDataUrl: ... }` を返却
- 入力:
  - `Content-Type: application/json`
  - ボディ: `{ "dataURL": "data:image/png;base64,AAA..." }`
- 期待結果:
  - ステータス: `200`
  - JSON: `{ ok: true, me: { id: 'U1' } }`
- 対応テストコード:
  - ファイル: `tests/api.user.icon.spec.ts`
  - `describe('PUT /api/user/icon') > it('dataURL を保存し、{ ok:true, me } を返す')`

#### API-USERICON-02（認証: 未ログイン）

- 区分: 異常（認証）
- 観点:
  - `requireUserId` 結果が falsy の場合、401 を返却すること
- 前提:
  - `requireUserId` → `null` など falsy を返却
- 入力:
  - 正常な `Content-Type` / `dataURL` を想定（body は有効）
- 期待結果:
  - ステータス: `401`
  - JSON: `{ ok:false, error:'unauthorized' }`
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `PUT /api/user/icon > 未ログインは 401/403 相当`
  - `未ログインは 401 or 403 を返す`（既存方針との互換のため 401/403 許容）

#### API-USERICON-03（認証: 認証処理例外）

- 区分: 異常（認証）
- 観点:
  - `requireUserId` 内部で例外発生時も 401 を返却すること
- 前提:
  - `requireUserId` → 例外をスロー
- 入力:
  - 正常な `Content-Type` / `dataURL`
- 期待結果:
  - ステータス: `401`（テスト上は 401/403 許容）
  - JSON: `{ ok:false, error:'unauthorized' }`
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `認証処理が例外なら 401 or 403 を返す`

#### API-USERICON-04（ヘッダー: Content-Type 不正）

- 区分: 異常（入力ヘッダー）
- 観点:
  - `Content-Type` に `application/json` を含まない場合、400/415 を返すこと
- 前提: 認証は成功させる
- 入力:
  - `Content-Type: text/plain` 等
  - ボディは JSON 形式だが `content-type` 不一致
- 期待結果:
  - ステータス: 400（実装は 400 固定、テスト上は 400/415 許容）
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `Content-Type 不正は 400/415`

#### API-USERICON-05（JSON パース失敗）

- 区分: 異常（JSON）
- 観点:
  - ボディが壊れていて `req.json()` で例外の場合、400 を返すこと
- 前提: 認証は成功
- 入力:
  - `Content-Type: application/json`
  - ボディ: 不正 JSON（例: `'{'` のみ）
- 期待結果:
  - ステータス: `400`
  - JSON: `{ ok:false, error:'bad json' }`
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `壊れた JSON は 400`

#### API-USERICON-06（dataURL 未指定）

- 区分: 異常（dataURL）
- 観点:
  - `dataURL` プロパティが存在しない場合、400 を返すこと
- 前提: 認証は成功
- 入力:
  - ボディ: `{}`
- 期待結果:
  - ステータス: `400`
  - JSON: `{ ok:false, error:'dataURL must be string' }`（実装準拠）
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `dataURL 未指定は 400`

#### API-USERICON-07（dataURL 型不正: 文字列以外）

- 区分: 異常（dataURL）
- 観点:
  - `dataURL` が文字列以外（number, object 等）の場合、400 を返すこと
- 前提: 認証は成功
- 入力:
  - ボディ: `{ "dataURL": 123 }` など
- 期待結果:
  - ステータス: `400`
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `dataURL が文字列以外なら 400`

#### API-USERICON-08（dataURL フォーマット不正: 非 data スキーム）

- 区分: 異常（dataURL）
- 観点:
  - `data:` で始まらない `dataURL` の場合、400 を返すこと
- 前提: 認証は成功
- 入力:
  - `dataURL: 'http://example.com/icon.png'` 等
- 期待結果:
  - ステータス: `400`
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `data: スキームでない dataURL は 400`

#### API-USERICON-09（dataURL フォーマット不正: MIME 不正）

- 区分: 異常（dataURL）
- 観点:
  - `image/png` 以外（例: `image/jpeg`）の MIME を拒否すること
- 前提: 認証は成功
- 入力:
  - `dataURL: 'data:image/jpeg;base64,...'`
- 期待結果:
  - ステータス: `400`
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `JPEGは拒否（mime不正）`

#### API-USERICON-10（dataURL フォーマット不正: base64 節が空）

- 区分: 異常（dataURL）
- 観点:
  - `data:image/png;base64,` の後ろが空文字の場合、400 を返すこと
- 前提: 認証は成功
- 入力:
  - `dataURL: 'data:image/png;base64,'`
- 期待結果:
  - ステータス: `400`
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `dataURL のbase64部が空なら 400`

#### API-USERICON-11（dataURL フォーマット不正: base64 デコードエラー）

- 区分: 異常（dataURL）
- 観点:
  - base64 部が不正で `Buffer.from(...,'base64')` が失敗する場合、400 を返すこと
- 前提: 認証は成功
- 入力:
  - `dataURL: 'data:image/png;base64,***INVALID***'`
- 期待結果:
  - ステータス: `400`
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `Base64 不正は 400`
  - `Base64 の decode 中に例外が出た場合は 400`

#### API-USERICON-12（dataURL: base64 内の改行/空白許容）

- 区分: 境界値（dataURL）
- 観点:
  - base64 部に改行や空白が含まれていても、空白除去後に decode 成功すれば許容されること
- 前提: 認証は成功
- 入力:
  - `dataURL: 'data:image/png;base64,AA A\nBB\tCC'` 等
- 期待結果:
  - ステータス: `200` または `400`（実装上いずれでも「parse が 1 回実行されている」ことを確認するテスト）
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `Base64に改行や空白が含まれていても許容`

#### API-USERICON-13（DB: 対象ユーザー無し → 404（NotFound系））

- 区分: 異常（DB）
- 観点:
  - Prisma が not-found 系のエラー（P2025 等）を投げた場合、404 を返却すること
- 前提:
  - `prisma.user.update` → `code: 'P2025'` を持つエラーを throw
- 入力:
  - 正常な `dataURL`
- 期待結果:
  - ステータス: `404`
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `DBで対象ユーザー無しなら 404`

#### API-USERICON-14（DB: updateMany で count === 0 → 404）

- 区分: 異常（DB）
- 観点:
  - `updateMany` 相当の戻り値 `{ count: 0 }` の場合、404 を返却すること
- 前提:
  - `__hooks.updateUserIcon` が `{ count: 0 }` を返すようモック
- 入力:
  - 正常な `dataURL`
- 期待結果:
  - ステータス: `404`
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `DBで対象ユーザーが存在せず更新0件なら 404`

#### API-USERICON-15（DB: その他のエラー → 500）

- 区分: 異常（DB）
- 観点:
  - not-found ではない DB エラーは 500 を返すこと
- 前提:
  - `prisma.user.update` が汎用的なエラーを throw（`code` なし、または not-found 判定に該当しない）
- 入力:
  - 正常な `dataURL`
- 期待結果:
  - ステータス: `500`
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `DB 更新失敗は 500 系`

#### API-USERICON-16（内部で予期せぬ例外 → 500）

- 区分: 異常（内部エラー）
- 観点:
  - ルート処理の try-catch 最外層で予期せぬ例外が発生した場合、500 を返すこと
- 前提:
  - `PUT` 内の一部処理を `vitest.spyOn` 等で強制的に throw させる
- 入力:
  - 正常な `Content-Type` / `dataURL`
- 期待結果:
  - ステータス: `500`
- 対応テストコード:
  - `tests/api.user.icon.spec.ts`
  - `内部で予期せぬ例外なら 500`

#### API-USERICON-17（Hook スモーク: parseAndNormalizeDataURL が 1 回だけ呼ばれる）

- 区分: スモーク / 実装検証
- 観点:
  - `PUT` 実行時に `parseAndNormalizeDataURL` が 1 回だけ呼び出されること
  - ルートファイルからトップレベル関数を直接 spy できる構成になっていることの確認
- 前提:
  - `requireUserId` モック → `'U1'`
  - `prisma.user.update` モック → 正常な更新結果
  - `vi.spyOn(mod, 'parseAndNormalizeDataURL')`
- 入力:
  - 正常な `dataURL`
- 期待結果:
  - `parseAndNormalizeDataURL` の呼び出し回数: 1 回
  - レスポンスステータス: 200
- 対応テストコード:
  - `tests/api.user.icon.hook-smoke.spec.ts`
  - `parseAndNormalizeDataURL を実際に呼び出している（spy が刺さる）`

## 5. 今後の拡張・カバレッジ 100% 化方針

- 現状 `/app/api/user/icon/route.ts` は 98% 程度のカバレッジだが、
  未通過分岐（特に `mapDataUrlError` や DB エラー判定の細かい分岐）を追加テストで網羅することで 100% を目指す。
- 追加時の方針:
  - 本ドキュメントの `API-USERICON-xx` を追番で追加
  - テストコードの `it` 名には ID をコメント等で紐付ける（例: `// API-USERICON-18`）
  - 既存テストの期待ステータス・エラーメッセージを変更する場合は、ここも同時に更新する。

---
[目次](../../目次.md) > テストケース集 > APIテストケース集 > /api/user/icon テストケース
