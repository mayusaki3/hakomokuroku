[目次](../目次.md) > アーキテクチャ > API設計 > Account / QRアクセス

# Account / QRアクセス

## 1. 責務

AccountはUserの表示情報を管理する。認証とTOTPは[認証API](./80_API_認証.md)、Box.code発行用Deviceは[Device API](./84_API_Device.md)を参照。

## 2. Account API

- `GET /api/account` — ログインUserのID、表示名、アイコン情報を取得
- `PATCH /api/account` — 表示名を更新
- `PUT /api/account/icon` — アイコンを設定・変更
- `DELETE /api/account/icon` — アイコンを削除

すべて認証必須。User scopeはsessionから確定する。表示名fieldはAPI / DBとも `displayName` に統一し、trim + NFCで正規化する。ログイン用 `userId` は別fieldであり変更しない。アイコンの形式・容量・保存方式は[Account / Theme画像設計](./88_Account_Theme画像設計.md)、画像APIは[UserImage API](./89_API_UserImage.md)を参照。

`PATCH /api/account` のrequestは `{ "displayName": "string" }` とする。`GET /api/account` は `id`、`userId`、`displayName`、`iconImageId` を返す。AccountのUser IDはログイン識別子であり、表示名とは区別する。

## 3. セッション管理

v0.8で必須のセッション操作は[認証API](./80_API_認証.md)のlogin、me、logout。

旧SyncTokenの一覧・失効APIはBox.code用Deviceと混同しない。複数セッションの一覧・個別失効は別途仕様確定するまでv0.8の必須APIとしない。

## 4. QR payload

QRにはcanonical `Box.code` の文字列そのものを格納する。

例:

```text
BX-AB2C0000
```

URL、timestamp、署名、User ID、認証tokenは含めない。

## 5. QR読み取り

1. QR文字列を取得する。
2. canonical Box.code形式を検証する。
3. 現在のUser-local IndexedDBで同一codeのactive Boxを検索する。
4. 見つかればBox詳細を表示する。
5. 見つからない場合、未同期・同期未完了・別Userの箱などの可能性を考慮し、存在しないと即断しない。
6. onlineで認証済みなら通常同期を実行して再検索できる。

QR読み取りのためだけのserver公開lookup APIは設けない。offlineでも既存local Businessを検索できる。

## 6. QRと認可

Box.codeは秘密情報ではなく識別子。Box.codeを知っていることは閲覧権限を意味しない。

server Business情報の取得はauthenticated User scopeに限定する。

## 7. 旧実装との差分

- `/api/b/[code]` のtimestamp/HMAC署名URL方式は廃止対象。
- `/api/settings/user` と `/api/user/profile` の表示名更新をAccount APIへ統一。
- 旧 `/api/user/profile` のSyncToken deviceName更新はAccount更新から分離。
- `/api/user/icon` の旧互換dataURL引数を正規仕様として維持しない。
- 旧SyncToken管理をBox.code用Device管理へ移植しない。

## 8. Error mapping

| HTTP | error | 意味 |
| --- | --- | --- |
| 400 | invalid_request | 入力形式不正 |
| 401 | unauthorized | 未認証 |
| 404 | not_found | 対象なし |
| 413 | payload_too_large | 画像サイズ超過 |
| 415 | unsupported_media_type | 非対応画像形式 |
| 500 | internal_error | 内部エラー |

[目次](../目次.md) > アーキテクチャ > API設計 > Account / QRアクセス
