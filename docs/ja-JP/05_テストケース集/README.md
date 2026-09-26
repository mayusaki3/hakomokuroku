<!--
HLDocS:LLM-MANAGED
doc_id: doc-20260516-184700Z-TEST-INDEX
lang: ja-JP
canonical_title: テストケース集 目次
document_type: index
canonical_document: true
-->

[目次](../README.md) > テストケース集

# テストケース集 目次

API仕様と原則同じ分類番号を使用する。

## 00 ライブラリ
- [lib/db ローカルDBラッパー](./00_ライブラリ/lib_db_local_testcases.md)
- [server/auth](./00_ライブラリ/server_auth_testcases.md)
- [server/crypto](./00_ライブラリ/server_crypto_testcases.md)

## 01 ユーザー認証API
- [ログイン](./01_ユーザー認証API/api_auth_login_testcases.md)
- [TOTPログイン](./01_ユーザー認証API/api_auth_login_totp_testcases.md)
- [ログアウト](./01_ユーザー認証API/api_auth_logout_testcases.md)
- [認証状態取得](./01_ユーザー認証API/api_auth_me_testcases.md)
- [ユーザー登録](./01_ユーザー認証API/api_auth_register_testcases.md)
- [トークン一覧取得](./01_ユーザー認証API/api_auth_tokens_testcases.md)
- [トークンラベル更新](./01_ユーザー認証API/api_auth_tokens_label_testcases.md)
- [トークン失効](./01_ユーザー認証API/api_auth_tokens_revoke_testcases.md)
- [全トークン失効](./01_ユーザー認証API/api_auth_tokens_revokeAll_testcases.md)
- [TOTP初期設定](./01_ユーザー認証API/api_auth_totp_setup_testcases.md)
- [TOTP状態取得](./01_ユーザー認証API/api_auth_totp_status_testcases.md)
- [TOTP検証](./01_ユーザー認証API/api_auth_totp_verify_testcases.md)
- [TOTP無効化](./01_ユーザー認証API/api_auth_totp_disable_testcases.md)
- [TOTPリカバリーコード再発行](./01_ユーザー認証API/api_auth_totp_recovery_reissue_testcases.md)

## 02 設定API
- [ユーザー設定](./02_設定API/api_settings_user_testcases.md)
- [アクティブテーマ取得](./02_設定API/api_settings_theme_active_testcases.md)

## 03 ユーザー情報API
- [ユーザーアイコン更新](./03_ユーザー情報API/api_user_icon_testcases.md)

[目次](../README.md) > テストケース集
