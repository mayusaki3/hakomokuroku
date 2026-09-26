<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260516-184500Z-API-INDEX
lang: ja-JP
canonical_title: API仕様 目次
document_type: index
canonical_document: true
-->

[目次](../README.md) > API仕様

# API仕様 目次

## 00 ライブラリ
- [lib/db ローカルDBラッパー](./00_ライブラリ/lib_db_local.md)
- [server/auth](./00_ライブラリ/server_auth.md)
- [server/crypto](./00_ライブラリ/server_crypto.md)

## 共通仕様
- [共通仕様](./00_共通仕様.md)
- [エラー仕様詳細](./10_エラー仕様詳細.md)
- [セッション仕様](./55_セッション仕様.md)

## 01 ユーザー認証API
- [ログイン](./01_ユーザー認証API/api_auth_login.md)
- [TOTPログイン](./01_ユーザー認証API/api_auth_login_totp.md)
- [ログアウト](./01_ユーザー認証API/api_auth_logout.md)
- [認証状態取得](./01_ユーザー認証API/api_auth_me.md)
- [ユーザー登録](./01_ユーザー認証API/api_auth_register.md)
- [トークン一覧取得](./01_ユーザー認証API/api_auth_tokens.md)
- [トークンラベル更新](./01_ユーザー認証API/api_auth_tokens_label.md)
- [トークン失効](./01_ユーザー認証API/api_auth_tokens_revoke.md)
- [全トークン失効](./01_ユーザー認証API/api_auth_tokens_revokeAll.md)
- [TOTP初期設定](./01_ユーザー認証API/api_auth_totp_setup.md)
- [TOTP状態取得](./01_ユーザー認証API/api_auth_totp_status.md)
- [TOTP検証](./01_ユーザー認証API/api_auth_totp_verify.md)
- [TOTP無効化](./01_ユーザー認証API/api_auth_totp_disable.md)
- [TOTPリカバリーコード再発行](./01_ユーザー認証API/api_auth_totp_recovery_reissue.md)

## 02 設定API
- [ユーザー設定取得・更新](./02_設定API/api_settings_user.md)
- [アクティブテーマ取得](./02_設定API/api_settings_theme_active.md)

## 03 ユーザー情報API
- [ユーザーアイコン更新](./03_ユーザー情報API/api_user_icon.md)

[目次](../README.md) > API仕様
