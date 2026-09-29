[目次](../README.md) > UI/UX > Settings設計

# Settings設計

## 1. 方針
旧実装のSettings home / User / MFA / Theme / Backup / Visionを参考に、v0.8の確定済み設計へ再編する。
Settings homeは各設定の詳細編集画面ではなく、カテゴリ別の入口と現在状態の要約を基本とする。

## 2. Settings home

### 2.1 表示
- Theme
  - 現在のTheme名
  - Theme選択
  - Theme管理/編集への導線
- 表示密度
  - 旧 comfortable / compact は既存機能として維持する場合このカテゴリに置く

### 2.2 スキャン
旧Settings homeを基本に維持:
- 背面カメラを優先
- 読み取り時の音/バイブ
- 連続読み取りはv0.8で正式利用しないならUIへ出さない

### 2.3 検索・一覧
- 既定の並び順
- navigation時の検索条件維持など、利用者向け意味が明確な項目のみ
- 旧QR payload mode / URL prefixは廃止。v0.8.0初版でcanonical Box.codeのみ

### 2.4 ラベル
- 24mmラベル出力への導線
- A4ラベル出力への導線
- canonical label layoutを使用
- QR payload設定は設けない

### 2.5 データ
- Backup / Restore
- Sync状態/詳細への導線
- 旧syncBaseUrl / syncToken / endpoint入力は廃止

### 2.6 Account
AccountはSettingsから独立した画面領域とする。Settings homeにはAccount設定を内包しない。HeaderのUser icon等からAccountへ遷移する。

### 2.7 Help
- Helpトップへの導線
- version表示
- relevant help sectionへ各設定画面からdeep link可能

### 2.8 Vision
v0.8では表示しない。v1.0でVision設計完了後に追加する。

## 3. User profile
旧User画面の視覚的なプロフィール編集を維持する。
- User IDはread-only表示
- User name表示/編集
- User icon表示、file/camera、rotate、save
- Profile / MFA / Login sessions / Box.code DeviceはAccount領域としてまとめ、Settingsとは独立させる
- Logoutを配置してよい

旧SyncToken label由来の「デバイス名」はUser profileから削除し、Box.code Device管理へ移す。

## 4. Security
Security領域をUser profileと分離する。
- MFA/TOTP status/setup/disable/recovery
- login session一覧
- session個別失効
- 他session一括失効
- current session識別

session失効はDevice / DevicePrefix / DeviceStateへ作用しない。

## 5. Device
Box.code用Device管理画面:
- device name
- current device表示
- lastUsedAt
- activePrefix
- deviceId詳細表示
- 他の登録済みDevice一覧

v0.8ではDevice削除なし、prefix解放なし、DeviceState手動切替なし。

## 6. Theme
Settings homeではactive Theme選択とTheme管理への導線を提供する。
詳細は 95_Theme_Help設計.md。
built-in System/Light/Darkとuser themeを同一selectorで扱う。

## 7. Backup / Restore
旧 /settings/backup から旧同期設定を分離・削除する。
この画面はBackup / Restore操作だけを扱う。
Syncは自動Push/Pull設計に従い、endpoint/tokenを利用者に入力させない。

## 8. Sync status
SettingsからSync statusへ到達可能にする。
表示候補:
- online/offline
- last successful sync
- pending Outbox count
- unresolved conflict count
- current sync/error state

通常利用者にserver endpoint/token/revision等の内部設定を編集させない。

## 9. Help
Helpはpublic/offline閲覧可能。
Settings homeからHelpトップへ移動し、Theme/Backup/MFA/Device等の各詳細画面から対応章へdeep linkできる。

## 10. Navigation hierarchy
```
Settings
├─ 表示
│  └─ Theme管理
├─ スキャン
├─ 検索・一覧
├─ ラベル
│  ├─ 24mm
│  └─ A4
├─ データ
│  ├─ Backup / Restore
│  └─ Sync status
└─ Help / version

Account  ※ Settingsとは独立
├─ Profile
├─ Security / MFA
│  ├─ TOTP
│  └─ Recovery Code
├─ Login sessions
├─ Box.code Devices
└─ Logout
```

## 11. 旧実装からの整理
維持:
- Settingsカテゴリ画面
- Settingsとは独立したAccount/User領域
- Theme
- camera/scan preferences
- sort/filter preferences
- User profile/icon
- MFA
- Backup/Restore
- Help
- 24mm/A4 label

置換:
- device token label -> Box.code Device name
- token/device management -> Login session管理 + Box.code Device管理へ分離
- Themeの複数active state -> server canonical activeThemeへ統合

廃止:
- sync endpoint/token手入力
- QR URL payload mode/prefix
- legacy QR互換
- v0.8 Vision UI

## 12. Mobile / accessibility
- Settings homeは1列でも操作可能
- category card/row全体をtap targetとして扱える
- iconだけに意味を依存しない
- toggle/selectにはtext labelを付ける
- destructive session/logout操作は通常設定と視覚的に区別する
- keyboard/focus順をDOM順と一致させる

## 13. v0.8 completion
Settings homeと各詳細画面の責務が上記へ一致し、旧Sync/QR互換設定がUIに残っていないことをテスト対象とする。

[目次](../README.md) > UI/UX > Settings設計
