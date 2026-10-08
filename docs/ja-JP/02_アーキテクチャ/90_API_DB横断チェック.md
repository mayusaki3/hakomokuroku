[目次](../目次.md) > アーキテクチャ > API / DB横断チェック

# API / DB横断チェック

## 1. 対象

v0.8の設計文書と `apps/web/prisma/schema.prisma` の現状を照合する。これは実装着手ではなく、差分とテスト前確認事項の整理である。

## 2. 確認結果

| 項目 | 設計 | 現行Prisma | 状態 |
| --- | --- | --- | --- |
| User icon | `iconImageId` | `iconDataUrl` | 未反映 |
| UserImage | User scope複合identity、kind、hash、READY | モデルなし | 未反映 |
| Theme | `(userId,id)`、`wallpaperImageId` | `id`単独PK、`wallpaper Json?` | 未反映 |
| UserSetting | `uiSettings={}` | nullable Json | 未反映 |
| Device.name | optional display name | optional String | 一致 |
| Item.boxId | nullable | required | 未反映・既知 |
| DevicePrefix | User scope永久予約 | 複合PK | 構造上概ね一致 |

## 3. UserImage参照整合性

- `User.iconImageId` は同一Userの `UserImage` のみを参照できる。
- `Theme.wallpaperImageId` も同一Userの `UserImage` のみを参照できる。
- DBでは `(userId,imageId)` 複合FKを採用する。
- `UserImage.kind` とREADY状態はFKだけでは保証できないためservice transactionで検証する。
- UserImageの削除は参照解除とGCを経由する。参照中のbinaryを削除しない。

PrismaでUser自身の `(id,iconImageId)` 複合FKを表現する際は、relation循環とdelete actionを含めてschema validationで確認する。モデル上のFK追加だけで実装可能と断定しない。

## 4. ThemeとUserSetting

- Themeのidentityは `(userId,id)`。
- `activeTheme` は `builtin:system/light/dark` または `user:<themeId>`。
- `user:<themeId>` の所有者・存在はservice validationで確認する。
- Theme削除時はactiveThemeを `builtin:system` へ同一transactionで切り替える。
- UserSetting.uiSettingsは空objectを既定とし、許可fieldのみ受理する。

## 5. Account / Theme画像API field名

| 操作 | field |
| --- | --- |
| `POST /api/user-images` | `kind`, `file` |
| `GET /api/user-images/{imageId}` | path `imageId` |
| `PUT /api/account/icon` | `imageId` |
| `GET /api/account` | `iconImageId` |
| `PUT /api/settings/themes/{themeId}` | `wallpaperImageId` |
| `GET /api/settings/theme/active` | `activeTheme` |

`imageId` はUserImageのID。Business PhotoRefの `photoId` と混同しない。

## 6. 追加確認事項

- Account表示名はAPI / DBとも `displayName` に統一し、既存 `User.userName` は移行時に置換する。ログイン識別子 `userId` は変更しない。
- UserImage binary storageの配備時永続性・backup・復旧はserver運用設計で確認する。通常の利用者 `.hkmbackup` には含まれない。
- SQLite/Prismaの複合FK、循環relation、Json defaultの有効性はschema validationで確認する。
- 入力画像の制限値と変換は[Account / Theme画像設計](./88_Account_Theme画像設計.md)を正とする。
- 現行PrismaのItem.boxId必須をnullableへ変更するのは別の既定作業。

## 7. Prisma relation設計の確定

- `UserImage` は `@@id([userId,id])` とし、`userId -> User.id` を必須FKとする。
- `Theme` は `@@id([userId,id])`、`wallpaperImageId` はnullableとする。
- `Theme.wallpaperImageId` は `[userId,wallpaperImageId] -> UserImage[userId,id]` のnullable複合FKとする。参照解除時は明示的にnullへ更新し、参照中のUserImageは物理削除しない。
- `User.iconImageId` はUser.idと組み合わせた複合FKを第一候補とする。UserとUserImageの循環参照についてSQLite/Prisma validationで不成立なら、UserImage側に `accountOwnerUserId` のunique参照を持たせる代替を検討し、設計変更を明示する。FK無しのアプリ検証だけへ黙って後退しない。
- `UserImage.kind` / READY / 同一User検証はservice transactionで保証する。
- `UserSetting.uiSettings` はrequired Json、初期値 `{}` とする。
- Prismaの具体的なrelation構文は実装前のschema validationで確定し、その結果をテスト仕様へ反映する。

## 8. 次工程

1. 残るfield命名とDB relationを確定する。
2. 正式テストケースを実装前に作成する。
3. テストコードを作成する。
4. Prisma migrationとAPIを実装する。
5. 実装後のcoverage用追加テストは正式テストと区別する。

[目次](../目次.md) > アーキテクチャ > API / DB横断チェック
