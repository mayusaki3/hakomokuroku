[目次](../README.md) > アーキテクチャ > Theme / Help設計

# Theme / Help設計

## 1. Scope
v0.8.0を箱目録の初版とし、ThemeとHelpを正式UI機能として定義する。

## 2. Theme principle
既存実装に混在する system/light/dark、server保存Theme、CSS custom properties、localStorage active cacheを1つのTheme modelへ統合する。
v0.8のThemeは **組み込みテーマ + ユーザー定義テーマ** とする。

## 3. Built-in themes
最低限 System / Light / Dark を提供する。SystemはOS/browserの prefers-color-scheme に追従する。
組み込みテーマはapplication asset/configとして提供し、直接編集・削除不可。組み込みテーマをbaseとしてuser themeを作成できる。

## 4. User themes
Userは複数のuser themeを作成・保存できる。
保持項目は id, name, baseTheme(system|light|dark), tokens, wallpaper, createdAt, updatedAt。
authenticated User scopeでserver保存し、他Userから参照しない。

## 5. Theme tokens
v0.8では wallpaper background/image, content background, header background/image/foreground, toolbar background/foreground, input background/foreground/border, button background/foreground/border を正式tokenとする。
CSS custom property名は内部表現とし、任意CSS property/style injectionは許可しない。server/client双方で許可token/valueをvalidationする。

## 6. Wallpaper
none / color / uploaded image / camera captureを選択可能。
Theme専用assetでありBusiness PhotoRefとは共有しない。画像上限・形式・保存方式はAPI詳細設計で固定する。

## 7. Edit / preview
編集対象はname, base theme, supported tokens, wallpaper。
Save / Cancel / Reset token to base / Previewを提供する。
Cancelはactive themeを変更せず、draftをapplication全体へ恒久適用しない。

## 8. Active theme
active themeはUser settingとしてserverを正本とする。
- built-in: builtin:system / builtin:light / builtin:dark
- user: user:<themeId>

localStorageは起動直後/offline表示用のUser-scoped cacheのみ。
onlineではcacheを即時適用してよいがserver値取得後にserverを採用しcache更新。
offlineではlast known cache、無ければ builtin:system。
Theme変更はBusiness Outboxへ積まない。offline中の確定編集/切替はv0.8では行わない。

## 9. User theme deletion
非active user themeは削除可能。active theme削除時は別Themeへの切替、またはbuiltin:systemへの切替を明示確認する。
Business dataへ影響しない。

## 10. Authentication / logout
server Themeは保持する。local cacheを別Userへ流用しない。public UIはbuilt-in themeを利用可能。

## 11. Accessibility / canonical output
focus indicatorを消すtokenは提供しない。状態表現を色だけに依存させない。
ThemeはQR/label/print outputへ影響させずcanonical output styleを使用する。

## 12. Legacy cleanup
v0.8実装時:
- Settings.theme system/light/darkをactiveThemeへ統合
- ThemeActiveとUserSetting.activeThemeName/darkの重複active stateを単一modelへ統合
- hk.themeActiveId / hk.themeActiveVarsをUser-scoped cacheへ変更
- v0.8.0初版のため旧Theme storage/API互換migrationは不要

## 13. Help
Helpはv0.8正式機能。最低限:
1. 箱目録でできること
2. Box登録
3. Item登録・取り出し・移動
4. Boxを別Boxへ収納
5. Box / Item検索
6. QR
7. 24mmラベル
8. A4ラベル
9. Location
10. 写真・並べ替え
11. Offline / Sync
12. SyncConflict
13. Backup / Restore
14. User / MFA / Device
15. Theme
16. PWA install/update
17. よくある問題

Helpはbundled contentを基本としoffline閲覧可能にする。

## 14. Help navigation
Settingsおよびmain navigation/User menuから到達可能。関連画面からsection deep link可能な構造にする。Help閲覧に認証を必須としない。

## 15. Completion criteria
Theme: built-in System/Light/Dark + user themeを同じselectorで選択、create/edit/preview/delete、server canonical + User-scoped cache、cross-user leakageなし、printへ影響なし。
Help: 上記主要章、offline閲覧、Settings/main UIから到達可能。

[目次](../README.md) > アーキテクチャ > Theme / Help設計
