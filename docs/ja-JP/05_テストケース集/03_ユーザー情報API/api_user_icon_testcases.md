[目次](../../目次.md) > テストケース集 > ユーザー情報API > ユーザーアイコン更新（PUT /api/user/icon）

# テストケース：ユーザーアイコン更新（PUT /api/user/icon）

## API_USER_ICON-TC-01 正常（PNG Base64）
### 前提
- ログイン済み
- 有効な PNG dataURL 形式

### 入力例
```json
{ "icon": "data:image/png;base64,AAAA..." }
```

### 期待
- ステータスコード: 200
- レスポンスボディ:
  - ok: true
  - me.iconUrl（またはそれに相当するフィールド）が更新されている

---

## API_USER_ICON-TC-02 未ログイン（セッションなし）
### 前提
- 未ログイン状態（セッション Cookie なし）

### 入力
- TC-01 と同じ形式の icon を送る

### 期待
- ステータスコード: 401 または 403
- レスポンスボディ:
  - ok: false
  - error: "unauthorized" 相当（実装準拠）

---

## API_USER_ICON-TC-03 認証処理が例外
### 前提
- 認証処理（readSession 等）が例外を投げるようモック

### 入力
- icon は TC-01 と同様の正しい形式

### 期待
- ステータスコード: 401 または 403
- レスポンスボディ:
  - ok: false

---

## API_USER_ICON-TC-04 icon 未指定
### 入力
```json
{}
```

### 期待
- ステータスコード: 400
- レスポンスボディ:
  - ok: false
  - error: "invalid_request"

---

## API_USER_ICON-TC-05 icon が文字列以外
### 入力例
```json
{ "icon": 12345 }
```

### 期待
- ステータスコード: 400
- レスポンスボディ:
  - ok: false

---

## API_USER_ICON-TC-06 Content-Type 不正／未定義
### 前提
- Content-Type が `application/json` 以外、または取得時に undefined を返す

### 入力
- icon フィールドはあってもよい

### 期待
- ステータスコード: 400 または 415
- レスポンスボディ:
  - ok: false

---

## API_USER_ICON-TC-07 壊れた JSON
### 入力
- ボディが JSON として parse 不可能な文字列

### 期待
- ステータスコード: 400
- レスポンスボディ:
  - ok: false

---

## API_USER_ICON-TC-08 data: スキームでない dataURL
### 入力例
```json
{ "icon": "not-a-dataurl" }
```

### 期待
- ステータスコード: 400
- レスポンスボディ:
  - ok: false

---

## API_USER_ICON-TC-09 MIME 不正（text/plain / image/jpeg 等）
### 入力例
```json
{ "icon": "data:text/plain;base64,AAAA..." }
```

```json
{ "icon": "data:image/jpeg;base64,BBBB..." }
```

### 期待
- ステータスコード: 400 または 415
- レスポンスボディ:
  - ok: false

---

## API_USER_ICON-TC-10 Base64 不正
### 入力例
```json
{ "icon": "data:image/png;base64,@@@INVALID@@@" }
```

### 期待
- ステータスコード: 400
- レスポンスボディ:
  - ok: false

---

## API_USER_ICON-TC-11 Base64 decode 中に例外
### 前提
- Base64 decode 処理が例外を投げるようモック

### 入力
- 形式上は正しそうな dataURL

### 期待
- ステータスコード: 400
- レスポンスボディ:
  - ok: false

---

## API_USER_ICON-TC-12 Base64 部分が空
### 入力例
```json
{ "icon": "data:image/png;base64," }
```

### 期待
- ステータスコード: 400
- レスポンスボディ:
  - ok: false

---

## API_USER_ICON-TC-13 Base64 に改行・空白が含まれていても許容
### 入力例
```json
{
  "icon": "data:image/png;base64,AAAA\nBBBB   CCCC"
}
```

### 期待
- ステータスコード: 200
- レスポンスボディ:
  - ok: true

---

## API_USER_ICON-TC-14 DB 更新成功（updateMany count>0）
### 前提
- DB 側で updateMany の戻り値 count > 0 を返すようモック

### 入力
- 正常な dataURL

### 期待
- ステータスコード: 200
- レスポンスボディ:
  - ok: true

---

## API_USER_ICON-TC-15 DB 更新失敗（汎用エラー）
### 前提
- DB 更新処理が一般的なエラーを投げる

### 期待
- ステータスコード: 500
- レスポンスボディ:
  - ok: false
  - error: "internal_error"

---

## API_USER_ICON-TC-16 updateUserIcon が null を返す
### 前提
- アイコン更新ヘルパー updateUserIcon が null を返すようモック

### 期待
- ステータスコード: 500
- レスポンスボディ:
  - ok: false
  - error: "internal_error"

---

## API_USER_ICON-TC-17 DBエラー not-found 系（ユーザー無し）
### 前提
以下のいずれかの条件:
- DBエラー name=NotFoundError
- DBエラー meta.cause = "record to update not found"
- DBエラー message 未定義だが not found 判定される
- updateMany の戻り値 count = 0
- 対象ユーザーが存在しない

### 期待
- ステータスコード: 404
- レスポンスボディ:
  - ok: false
  - error: "not_found"

---

## API_USER_ICON-TC-18 DBエラー not-found系以外
### 前提
- DBエラーが発生するが、not-found 系に該当しない

### 期待
- ステータスコード: 500
- レスポンスボディ:
  - ok: false
  - error: "internal_error"

---

## API_USER_ICON-TC-19 内部で予期せぬ例外
### 前提
- ハンドラ内部で想定外の例外が発生するようモック

### 期待
- ステータスコード: 500
- レスポンスボディ:
  - ok: false
  - error: "internal_error"

---

[目次](../../目次.md) > テストケース集 > ユーザー情報API > ユーザーアイコン更新（PUT /api/user/icon）
