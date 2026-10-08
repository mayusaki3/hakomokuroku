[目次](../目次.md) > アーキテクチャ > API設計 > UserImage API

# UserImage API

## 1. 対象

Account iconとTheme wallpaper専用のbinary API。Business用 `/api/photos` と区別する。形式・容量・GCは[Account / Theme画像設計](./88_Account_Theme画像設計.md)を参照。

すべてauthenticated User scope。requestにuserIdを含めない。

## 2. Upload

`POST /api/user-images`

`multipart/form-data` に `kind`（`ACCOUNT_ICON` または `THEME_WALLPAPER`）と `file` を含める。

serverでdecode、検証、WebP canonical化、SHA-256計算、metadata登録、READY化を行う。既存のUser/Theme参照はuploadだけでは変更しない。

成功 `201`:

```json
{
  "ok": true,
  "image": {
    "id": "server-generated-id",
    "kind": "ACCOUNT_ICON",
    "mimeType": "image/webp",
    "contentHash": "sha256-hex",
    "byteLength": 12345,
    "width": 256,
    "height": 256
  }
}
```

## 3. 取得

`GET /api/user-images/{imageId}`

User所有権を確認し、`Content-Type: image/webp`、`Cache-Control: private, max-age=3600`、ETagを付けてbinaryを返す。`If-None-Match` に対応する。別Userの画像は404。

## 4. Accountへの適用

`PUT /api/account/icon`

```json
{ "imageId": "string" }
```

同一User所有のREADY画像で `kind=ACCOUNT_ICON` の場合のみ参照を切り替える。解除は `DELETE /api/account/icon`。Account取得時には `iconImageId` を返す。

## 5. Themeへの適用

`PUT /api/settings/themes/{themeId}` の `wallpaperImageId` に同一User所有のREADY画像（`kind=THEME_WALLPAPER`）またはnullを指定する。

User/Themeの参照更新はDB transactionで実行し、古い画像はGC候補とする。

## 6. Errors

| HTTP | error |
| --- | --- |
| 400 | invalid_request |
| 401 | unauthorized |
| 404 | not_found |
| 413 | payload_too_large |
| 415 | unsupported_media_type |
| 422 | invalid_image |
| 500 | internal_error |

## 7. 安全性

入力画像のMIME、magic bytes、decode結果、pixel数、寸法を検証する。filenameをstorage pathに使用しない。upload完了前の画像をREADYとして参照させない。

[目次](../目次.md) > アーキテクチャ > API設計 > UserImage API
