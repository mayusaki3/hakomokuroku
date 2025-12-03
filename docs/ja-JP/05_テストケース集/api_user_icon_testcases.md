[目次](../目次.md) > テストケース集 > ユーザーアイコン更新（PUT /api/user/icon）

# テストケース：ユーザーアイコン更新（PUT /api/user/icon）

## API_USER_ICON-TC-01 正常（PNG Base64）
### 前提
- ログイン済み  
- 有効な PNG Base64

### 入力
```
{ "icon": "data:image/png;base64,AAAA..." }
```

### 期待
- 200 OK  
- ok: true  
- me.iconUrl が更新されている  

---

## API_USER_ICON-TC-02 JPEG も許可
### 入力
```
{ "icon": "data:image/jpeg;base64,BBBB..." }
```
### 期待
- 200 OK

---

## API_USER_ICON-TC-03 icon 未指定
### 入力
```
{}
```
### 期待
- 400 Bad Request

---

## API_USER_ICON-TC-04 DataURL 形式不正
### 入力
```
{ "icon": "not-a-dataurl" }
```
### 期待
- 400 Bad Request

---

## API_USER_ICON-TC-05 MIME 不正
### 入力
```
{ "icon": "data:image/gif;base64,AAAA" }
```
### 期待
- 415 Unsupported Media Type

---

## API_USER_ICON-TC-06 未ログイン
### 期待
- 401 Unauthorized

---

## API_USER_ICON-TC-07 サーバー内部エラー
### 条件
- decode 処理が例外を throw

### 期待
- 500 Internal Server Error

---
[目次](../目次.md) > テストケース集 > ユーザーアイコン更新（PUT /api/user/icon）
