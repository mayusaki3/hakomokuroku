[目次](../目次.md) > アーキテクチャ > Account / Theme画像設計

# Account / Theme画像設計

## 1. 対象と責務

UserのAccountアイコンとUser Themeの壁紙を管理する。Box / Item / BoxLocationのBusiness PhotoRefとは別の画像領域とし、Business Syncおよび通常の `.hkmbackup` へ含めない。

## 2. 保存方式

- server上のbinary storageを正本とする。
- DBは画像のID、所有User、種別、content hash、MIME、byteLength、幅、高さ、作成日時等のmetadataを保持する。
- Userは任意のAccount icon参照、Themeは任意のwallpaper参照を持つ。
- 同一Userの別端末は認証後にserverから取得し、browser cacheを使用できる。
- 大きなdata URLをUser/Theme recordへ直接保存しない。

## 3. 画像種別

```text
ACCOUNT_ICON
THEME_WALLPAPER
```

Account iconはUserに最大1件のactive参照を持つ。Theme wallpaperはThemeごとに最大1件のactive参照を持つ。binaryは更新時に新規IDを割り当て、既存binaryを上書きしない。

## 4. DB追加候補

### UserImage

```text
userId       string       required
id           string       required
kind         enum         ACCOUNT_ICON | THEME_WALLPAPER
contentHash  string       required
mimeType     string       required
byteLength   int          required
width        int          required
height       int          required
createdAt    timestamp    required
```

identityは `(userId,id)`。保存先の内部pathは外部へ公開しない。

### User

```text
iconImageId  string?      optional
```

### Theme

```text
userId       string       required
id           string       required
name         string       required
baseTheme    system | light | dark
tokens       object       required
wallpaperImageId string?  optional
createdAt    timestamp    required
updatedAt    timestamp    required
```

### UserSetting

```text
userId       string       PK
activeTheme  string       required; default builtin:system
uiSettings   object       required; default {}
```

activeThemeは `builtin:system`、`builtin:light`、`builtin:dark`、`user:<themeId>` のいずれか。

参照先の所有Userと画像kindはservice transactionで検証する。Theme削除時、activeThemeが削除対象なら `builtin:system` へ戻す。

## 5. Binary APIの方針

Account iconとTheme wallpaperは、専用のUserImage upload / get APIで扱う。Business用 `/api/photos` は流用しない。

upload時はserverで画像をdecodeし、実際のMIME、画像寸法、byteLength、contentHashを検証する。

更新時は新しい画像をREADYにしてからUserまたはThemeの参照を切り替える。失敗時は既存参照を維持する。

## 6. 削除とGC

Account icon解除・Theme wallpaper解除・Theme削除はDB参照を先に更新する。参照されなくなったbinaryはGC候補にする。

未完了uploadや参照切替途中のbinaryを誤削除しないよう猶予期間を設ける。

## 7. Offlineとcache

local cacheは表示用であり正本ではない。offlineでcacheが無い場合は既定アイコン・壁紙なしを表示する。

Business Outboxへ画像設定変更を混入しない。offlineでの設定編集キューはv0.8の必須機能にしない。

## 8. 未確定事項

正式テストケース作成前に次を確定する。

- iconとwallpaperの受理画像形式
- それぞれの最大寸法・byteLength
- canonical変換方式とthumbnailの要否
- storage adapter、配信cache header、GC猶予期間
- UserImage upload / get APIの詳細request / response

## 9. 関連文書

- [DBスキーマ定義](./40_DBスキーマ定義.md)
- [Theme / User設定API](./85_API_Theme_User設定.md)
- [Account / QRアクセス](./86_API_Account_QR.md)
- [API / DB整合性確認](./87_API_DB整合性確認.md)

[目次](../目次.md) > アーキテクチャ > Account / Theme画像設計
