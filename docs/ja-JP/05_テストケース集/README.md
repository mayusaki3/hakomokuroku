<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260516-184700Z-TEST-INDEX
lang: ja-JP
canonical_title: テストケース集 目次
document_type: index
canonical_document: true
-->

[目次](../README.md) > テストケース集 > テストケース集 目次

# テストケース集 目次

本書は API テストケース仕様群の目次である。

---

## ユーザー認証API

- [ログイン テストケース](./01_ユーザー認証API/api_auth_login_testcases.md)
- [TOTPログイン テストケース](./01_ユーザー認証API/api_auth_login_totp_testcases.md)
- [ログアウト テストケース](./01_ユーザー認証API/api_auth_logout_testcases.md)
- [認証状態取得 テストケース](./01_ユーザー認証API/api_auth_me_testcases.md)
- [ユーザー登録 テストケース](./01_ユーザー認証API/api_auth_register_testcases.md)
- [トークン一覧取得 テストケース](./01_ユーザー認証API/api_auth_tokens_testcases.md)
- [トークンラベル更新 テストケース](./01_ユーザー認証API/api_auth_tokens_label_testcases.md)
- [トークン失効 テストケース](./01_ユーザー認証API/api_auth_tokens_revoke_testcases.md)
- [全トークン失効 テストケース](./01_ユーザー認証API/api_auth_tokens_revokeAll_testcases.md)
- [TOTP初期設定 テストケース](./01_ユーザー認証API/api_auth_totp_setup_testcases.md)
- [TOTP状態取得 テストケース](./01_ユーザー認証API/api_auth_totp_status_testcases.md)
- [TOTP検証 テストケース](./01_ユーザー認証API/api_auth_totp_verify_testcases.md)
- [TOTP無効化 テストケース](./01_ユーザー認証API/api_auth_totp_disable_testcases.md)
- [TOTPリカバリーコード再発行 テストケース](./01_ユーザー認証API/api_auth_totp_recovery_reissue_testcases.md)

---

## 設定API

- [ユーザー設定 テストケース](./02_設定API/api_settings_user_testcases.md)
- [アクティブテーマ取得 テストケース](./02_設定API/api_settings_theme_active_testcases.md)

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

[目次](../README.md) > テストケース集 > テストケース集 目次
