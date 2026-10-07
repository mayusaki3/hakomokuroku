[目次](../目次.md) > アーキテクチャ > API設計 > Theme / User設定API

# Theme / User設定API

## 1. 目的

User（利用者）ごとの表示ThemeとUI設定をserverへ保存するAPIを定義する。

ThemeはBusiness dataではなくUser設定であり、Business Sync / Backup / Restoreの対象外。

## 2. Theme種別

built-in Theme:

- `builtin:system`
- `builtin:light`
- `builtin:dark`

User Theme:

```text
user:<themeId>
```

User Themeは少なくとも次を持つ。

```text
id
name
baseTheme
tokens
wallpaper
createdAt
updatedAt
```

baseTheme:

```text
system | light | dark
```

任意CSSを保存・実行しない。

## 3. Active Theme取得

### GET /api/settings/theme/active

login済みUserではserver UserSettingをcanonicalとする。

response:

```json
{
  "ok": true,
  "activeTheme": "builtin:system"
}
```

未login時はserver User設定を参照せず、client既定値としてsystemを使用する。

APIとして未login成功responseを返す必要はない。

## 4. Active Theme変更

### PUT /api/settings/theme/active

request:

```json
{
  "activeTheme": "builtin:dark"
}
```

または:

```json
{
  "activeTheme": "user:<themeId>"
}
```

User Theme指定時はauthenticated User自身のThemeであることを確認する。

成功後、clientはuser-scoped localStorage cacheも更新する。

## 5. Theme一覧

### GET /api/settings/themes

authenticated UserのUser Theme一覧を返す。

built-in ThemeはDB recordとして作成しない。

clientはbuilt-in 3種とUser Theme一覧を合わせて表示する。

## 6. Theme取得

### GET /api/settings/themes/{themeId}

authenticated User自身のThemeだけを返す。

別UserのThemeは `404 not_found` として扱う。

## 7. Theme作成

### POST /api/settings/themes

request概念形式:

```json
{
  "name": "string",
  "baseTheme": "system",
  "tokens": {},
  "wallpaper": null
}
```

serverは許可済みtokenだけを保存する。

未知token、任意CSS、script、HTMLは受理しない。

## 8. Theme更新

### PUT /api/settings/themes/{themeId}

name / baseTheme / tokens / wallpaperを更新する。

idとUser ownershipは変更しない。

## 9. Theme削除

### DELETE /api/settings/themes/{themeId}

削除対象がactiveThemeの場合、同一transactionでactiveThemeを `builtin:system` へ戻す。

built-in Themeは削除できない。

## 10. Wallpaper

WallpaperはThemeの一部として扱う。

画像入力はdecode、size、MIMEをserver/clientの双方で検証する。

data URLを無制限にUserSettingへ埋め込む方式を正規仕様にしない。

具体的なbinary保存形式はTheme実装時のtest case作成前に確定する。

## 11. UI設定

Theme以外のUser UI設定はUserSetting.uiSettingsへ保存できる。

API:

```text
GET /api/settings/ui
PUT /api/settings/ui
```

uiSettingsは許可fieldをschema validationし、任意objectを無制限に保存しない。

## 12. User Accountとの分離

User表示名、User icon、TOTP等はTheme設定ではなくAccount領域。

認証状態確認は [認証API](./80_API_認証.md) を参照。

Device表示名は [Device API](./84_API_Device.md) を参照。

旧実装の「現在sessionのdeviceName」とBox.code Device nameを同一概念として扱わない。

## 13. Error mapping

| HTTP | error | 意味 |
| --- | --- | --- |
| 400 | invalid_request | request / token等が不正 |
| 401 | unauthorized | 未認証 |
| 404 | not_found | User scope内にThemeが存在しない |
| 409 | conflict | 現在状態では操作不可 |
| 413 | payload_too_large | Wallpaper等が上限超過 |
| 500 | internal_error | server内部エラー |

## 14. 現行実装との差分

v0.8実装時に少なくとも次を解消する。

- active Theme APIが複数実装されている。
- `default`、name/dark、themeId等の表現が混在している。
- Theme保存schemaが `vars` / `wallpaperThumb` の旧形式。
- User未login時にserver APIが既定Themeを返す実装がある。
- WallpaperがJPEG data URLとして直接返される旧処理がある。
- User profile更新と旧SyncToken deviceName更新が同一APIに混在している。

Theme identifierは `builtin:system/light/dark` または `user:<themeId>` へ統一する。

Vision設定APIはv0.8対象外とし、v1.0で再設計する。

[目次](../目次.md) > アーキテクチャ > API設計 > Theme / User設定API
