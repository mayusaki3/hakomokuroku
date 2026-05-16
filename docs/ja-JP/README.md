<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260516-183500Z-JP-INDEX
lang: ja-JP
canonical_title: docs/ja-JP 目次
document_type: index
canonical_document: true
-->

[目次](./README.md) > docs/ja-JP > docs/ja-JP 目次

# docs/ja-JP 目次

本書は、`docs/ja-JP` 配下の日本語ドキュメント群の入口となる目次である。

---

## API仕様

### ユーザー認証API

- [ログイン（POST /api/auth/login）](./04_API仕様/01_ユーザー認証API/api_auth_login.md)
- [TOTPログイン（POST /api/auth/login/totp）](./04_API仕様/01_ユーザー認証API/api_auth_login_totp.md)
- [ログアウト（POST /api/auth/logout）](./04_API仕様/01_ユーザー認証API/api_auth_logout.md)
- [認証状態取得（GET /api/auth/me）](./04_API仕様/01_ユーザー認証API/api_auth_me.md)
- [ユーザー登録（POST /api/auth/register）](./04_API仕様/01_ユーザー認証API/api_auth_register.md)
- [トークン一覧取得（GET /api/auth/tokens）](./04_API仕様/01_ユーザー認証API/api_auth_tokens.md)
- [トークンラベル更新（PUT /api/auth/tokens/label）](./04_API仕様/01_ユーザー認証API/api_auth_tokens_label.md)
- [トークン失効（DELETE /api/auth/tokens/revoke）](./04_API仕様/01_ユーザー認証API/api_auth_tokens_revoke.md)
- [全トークン失効（POST /api/auth/tokens/revokeAll）](./04_API仕様/01_ユーザー認証API/api_auth_tokens_revokeAll.md)
- [TOTP初期設定（POST /api/auth/totp/setup）](./04_API仕様/01_ユーザー認証API/api_auth_totp_setup.md)
- [TOTP状態取得（GET /api/auth/totp/status）](./04_API仕様/01_ユーザー認証API/api_auth_totp_status.md)
- [TOTP検証（POST /api/auth/totp/verify）](./04_API仕様/01_ユーザー認証API/api_auth_totp_verify.md)
- [TOTP無効化（POST /api/auth/totp/disable）](./04_API仕様/01_ユーザー認証API/api_auth_totp_disable.md)
- [TOTPリカバリーコード再発行（POST /api/auth/totp/recovery/reissue）](./04_API仕様/01_ユーザー認証API/api_auth_totp_recovery_reissue.md)

### 設定API

- [ユーザー設定取得・更新（GET/PUT /api/settings/user）](./04_API仕様/02_設定API/api_settings_user.md)
- [アクティブテーマ取得（GET /api/settings/theme/active）](./04_API仕様/02_設定API/api_settings_theme_active.md)

---

## テストケース集

### ユーザー認証API

- [ログイン テストケース](./05_テストケース集/01_ユーザー認証API/api_auth_login_testcases.md)
- [TOTPログイン テストケース](./05_テストケース集/01_ユーザー認証API/api_auth_login_totp_testcases.md)
- [トークン一覧取得 テストケース](./05_テストケース集/01_ユーザー認証API/api_auth_tokens_testcases.md)
- [トークンラベル更新 テストケース](./05_テストケース集/01_ユーザー認証API/api_auth_tokens_label_testcases.md)
- [トークン失効 テストケース](./05_テストケース集/01_ユーザー認証API/api_auth_tokens_revoke_testcases.md)
- [全トークン失効 テストケース](./05_テストケース集/01_ユーザー認証API/api_auth_tokens_revokeAll_testcases.md)
- [TOTP検証 テストケース](./05_テストケース集/01_ユーザー認証API/api_auth_totp_verify_testcases.md)

### 設定API

- [ユーザー設定 テストケース](./05_テストケース集/02_設定API/api_settings_user_testcases.md)
- [アクティブテーマ取得 テストケース](./05_テストケース集/02_設定API/api_settings_theme_active_testcases.md)

---

## 現在の同期状態

| 対象 | 状態 |
|---|---|
| route ↔ Vitest | 同期済み |
| spec ↔ testspec | 同期済み |
| Traceability | 整理中 |
| HLDocS 正規化 | 継続中 |

---

## ローカル検証

```bash
pnpm -C apps/web exec vitest --run
```

現時点:

```text
Test Files  22 passed (22)
Tests      218 passed (218)
```

---

[目次](./README.md) > docs/ja-JP > docs/ja-JP 目次
