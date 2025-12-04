[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログアウト（POST /api/auth/logout）

# テストケース：ログアウト（POST /api/auth/logout）

## AUTH_LOGOUT-TC-01 正常（常に200）

### 概要
ログアウト要求は常に成功し、{ ok:true } が返る。

#### 入力
POST /api/auth/logout

#### 期待結果

| 種別 | 値 |
|------|-----|
| ステータス | 200 |
| ボディ | { ok:true } |

---

## AUTH_LOGOUT-TC-02 内部例外（500）

### 概要
セッション削除処理が throw した場合、500 を返す。

#### モック条件
セッション削除関数を throw

#### 期待結果

| 種別 | 値 |
|------|-----|
| ステータス | 500 |
| ボディ | { ok:false, error:"internal error" } |

---

## AUTH_LOGOUT-TC-03 多重ログアウト（idempotent）

### 概要
複数回ログアウトしても同じ結果になる。

#### 入力
POST → POST

#### 期待結果
両方とも:

| ステータス | ボディ |
|------------|--------|
| 200 | { ok:true } |

---
[目次](../../目次.md) > テストケース集 > ユーザー認証API > ログアウト（POST /api/auth/logout）
