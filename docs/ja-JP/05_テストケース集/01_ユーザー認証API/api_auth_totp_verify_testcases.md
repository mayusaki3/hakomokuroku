[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）

# テストケース：TOTP有効化確認（POST /api/auth/totp/verify）

本書は、TOTP 有効化確認 API（POST /api/auth/totp/verify）のテストケース定義を示す。  
API 仕様の前提に基づき、**ログインは sid Cookie** により行われる。

---

## 1. 前提条件

- ベース URL: `/api/auth/totp/verify`
- `/api/auth/totp/setup` により **pending secret（未確定シークレット）** が保存されているユーザーを事前に準備する。
- トークン認証は使用せず、**sid Cookie ベースのログイン状態** をテスト環境で再現する。

---

## 2. テストケース一覧

| テスト ID | 内容 |
|-----------|-------|
| TOTP-VERIFY-TC-01 | 正常：未有効ユーザーが正しいコードを送信 |
| TOTP-VERIFY-TC-02 | 異常：code 未指定（400） |
| TOTP-VERIFY-TC-03 | 異常：code のフォーマット不正（400） |
| TOTP-VERIFY-TC-04 | 異常：code 不一致（422） |
| TOTP-VERIFY-TC-05 | 異常：未ログイン（401） |
| TOTP-VERIFY-TC-06 | 異常：setup 未実行（409） |
| TOTP-VERIFY-TC-07 | 異常：既に有効化済み（409） |

---

## 3. テストケース詳細

---

### TOTP-VERIFY-TC-01 正常：未有効ユーザーが正しいコードを送信

#### 前提
- ユーザー A は `/api/auth/totp/setup` を完了しており pending secret が保存されている。
- まだ TOTP 有効化されていない（totpEnabled=false）。
- テスト用シークレットと時刻から「正しい 6 桁 TOTP コード」を事前生成しておく。

#### 入力
- Cookie: `sid=<有効セッションID>`
- Body:

```json
{ "code": "<正しい6桁コード>" }
```

#### 期待結果
- ステータス: **200**
- レスポンス:

```json
{
  "ok": true,
  "recoveryCodes": ["...."]
}
```

- recoveryCodes は **初回のみ生成される** ため、配列であることを確認。
- DB: ユーザー A の `totpEnabled=true`、pending secret が削除されている。

---

### TOTP-VERIFY-TC-02 異常：code 未指定（400）

#### 入力例

```json
{}
```

または

```json
{ "code": "" }
```

#### 期待結果
- ステータス: **400**
- エラー形式:

```json
{ "ok": false, "error": "INVALID_CODE_FORMAT" }
```

---

### TOTP-VERIFY-TC-03 異常：code のフォーマット不正（400）

#### 入力例

```json
{ "code": "abc123" }
```

#### 期待結果
- ステータス: **400**
- エラー:

```json
{ "ok": false, "error": "INVALID_CODE_FORMAT" }
```

---

### TOTP-VERIFY-TC-04 異常：code 不一致（422）

#### 入力
- 正しい形式（6 桁数字）の code だが不正な値（例 `"000000"`）

#### 期待結果
- ステータス: **422**
- エラー:

```json
{ "ok": false, "error": "INVALID_CODE" }
```

---

### TOTP-VERIFY-TC-05 異常：未ログイン（401）

#### 入力
- Cookie: **なし**

#### 期待結果
- ステータス: **401**
- エラー:

```json
{ "ok": false, "error": "UNAUTHORIZED" }
```

---

### TOTP-VERIFY-TC-06 異常：setup 未実行（409）

#### 前提
- ユーザー B は `/api/auth/totp/setup` を実行しておらず pending secret が無い。

#### 入力
- Cookie: `sid=<ユーザーB>`
- Body: 正しい形式の code

#### 期待結果
- ステータス: **409**
- エラー:

```json
{ "ok": false, "error": "CONFLICT_STATE" }
```

---

### TOTP-VERIFY-TC-07 異常：既に有効化済み（409）

#### 前提
- ユーザー C は既に totpEnabled=true。

#### 入力
- Cookie: `sid=<ユーザーC>`
- Body: 正しい形式の code

#### 期待結果
- ステータス: **409**
- エラー:

```json
{ "ok": false, "error": "CONFLICT_STATE" }
```

---

[目次](../../目次.md) > テストケース集 > ユーザー認証API > TOTP有効化確認（POST /api/auth/totp/verify）
