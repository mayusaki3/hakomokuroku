[目次](../../目次.md) > テストケース集 > ユーザー情報API > ユーザー基本設定 (GET/PUT /api/settings/user)

# テストケース：ユーザー基本設定 (GET/PUT /api/settings/user)

## GET /api/settings/user

### API_SETTINGS_USER-TC-01 正常
- 条件: ログイン中
- 期待: 200, ok:true, user が返る

### API_SETTINGS_USER-TC-02 未ログイン
- 条件: セッションなし
- 期待: 401

### API_SETTINGS_USER-TC-03 内部例外
- 条件: prisma が例外
- 期待: 500

---

## PUT /api/settings/user

### API_SETTINGS_USER-TC-10 正常更新
- 条件: displayName="abc"
- 期待: 200, ok:true

### API_SETTINGS_USER-TC-11 バリデーションエラー
- 条件: displayName=""
- 期待: 400

### API_SETTINGS_USER-TC-12 未ログイン
- 条件: Cookieなし
- 期待: 401

### API_SETTINGS_USER-TC-13 内部例外
- 条件: prisma が例外
- 期待: 500

---
[目次](../../目次.md) > テストケース集 > ユーザー情報API > ユーザー基本設定 (GET/PUT /api/settings/user)
