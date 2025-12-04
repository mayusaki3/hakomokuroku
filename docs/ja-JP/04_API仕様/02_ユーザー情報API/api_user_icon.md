[目次](../../目次.md) > API仕様 > ユーザー情報API > ユーザーアイコン更新（PUT /api/user/icon）

# ユーザーアイコン更新（PUT /api/user/icon）

## 1. 概要
ユーザーが自身のアイコン画像を更新する API。  
画像は Base64 DataURL として受け取り、ユーザープロファイルに保存する。

---

## 2. エンドポイント
- PUT /api/user/icon

---

## 3. 認証
- 必須（セッショントークン）

---

## 4. リクエスト仕様

### リクエストヘッダ
| 項目 | 値 |
|------|------|
| Content-Type | application/json |
| Authorization | Bearer {token} |

### リクエストボディ
```
{
  "icon": "data:image/png;base64,xxxxx"
}
```

#### 制約
- Base64 DataURL のみ許可
- 画像形式は PNG / JPEG のみ許可
- サイズ上限：1MB 程度（実装側で enforce）

---

## 5. レスポンス仕様

### 成功時（200 OK）
```
{
  "ok": true,
  "me": {
    "id": "xxxx",
    "displayName": "ユーザー名",
    "iconUrl": "blob or local path"
  }
}
```

### 異常時

| ステータス | 内容 |
|-----------|------|
| 400 | icon 不正（形式不正/未指定など） |
| 401 | 認証なし |
| 415 | MIME タイプ不正 |
| 500 | サーバー内部エラー |

---

## 6. 振る舞い
1. DataURL の MIME を検証  
2. decode → 圧縮/リサイズ（実装依存）  
3. プロファイルストレージへ保存  
4. 最新の me 情報を返す  

---
[目次](../../目次.md) > API仕様 > ユーザー情報API > ユーザーアイコン更新（PUT /api/user/icon）
