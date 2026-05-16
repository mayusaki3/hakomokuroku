<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260516-184500Z-API-INDEX
lang: ja-JP
canonical_title: API仕様 目次
document_type: index
canonical_document: true
-->

[目次](../README.md) > API仕様 > API仕様 目次

# API仕様 目次

本書は API仕様群の目次である。

---

## ユーザー認証API

- [ログイン（POST /api/auth/login）](./01_ユーザー認証API/api_auth_login.md)
- [TOTPログイン（POST /api/auth/login/totp）](./01_ユーザー認証API/api_auth_login_totp.md)
- [ログアウト（POST /api/auth/logout）](./01_ユーザー認証API/api_auth_logout.md)
- [認証状態取得（GET /api/auth/me）](./01_ユーザー認証API/api_auth_me.md)
- [ユーザー登録（POST /api/auth/register）](./01_ユーザー認証API/api_auth_register.md)
- [トークン一覧取得（GET /api/auth/tokens）](./01_ユーザー認証API/api_auth_tokens.md)
- [トークンラベル更新（PUT /api/auth/tokens/label）](./01_ユーザー認証API/api_auth_tokens_label.md)
- [トークン失効（DELETE /api/auth/tokens/revoke）](./01_ユーザー認証API/api_auth_tokens_revoke.md)
- [全トークン失効（POST /api/auth/tokens/revokeAll）](./01_ユーザー認証API/api_auth_tokens_revokeAll.md)
- [TOTP初期設定（POST /api/auth/totp/setup）](./01_ユーザー認証API/api_auth_totp_setup.md)
- [TOTP状態取得（GET /api/auth/totp/status）](./01_ユーザー認証API/api_auth_totp_status.md)
- [TOTP検証（POST /api/auth/totp/verify）](./01_ユーザー認証API/api_auth_totp_verify.md)
- [TOTP無効化（POST /api/auth/totp/disable）](./01_ユーザー認証API/api_auth_totp_disable.md)
- [TOTPリカバリーコード再発行（POST /api/auth/totp/recovery/reissue）](./01_ユーザー認証API/api_auth_totp_recovery_reissue.md)

---

## 設定API

- [ユーザー設定取得・更新（GET/PUT /api/settings/user）](./02_設定API/api_settings_user.md)
- [アクティブテーマ取得（GET /api/settings/theme/active）](./02_設定API/api_settings_theme_active.md)

---

[目次](../README.md) > API仕様 > API仕様 目次
