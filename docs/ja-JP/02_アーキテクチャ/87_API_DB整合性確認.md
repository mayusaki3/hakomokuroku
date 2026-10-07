[目次](../目次.md) > アーキテクチャ > API設計 > API / DB整合性確認

# API / DB整合性確認

## 1. 対象

v0.8の認証、Business / Sync、写真、Backup / Restore、Device、Theme / User設定、Account / QR APIとDBスキーマの整合を確認する。

## 2. 管理対象の境界

| 対象 | 正本 | Business Sync | .hkmbackup |
| --- | --- | --- | --- |
| Box / Item / BoxLocation | server Business + local Outbox | 対象 | 対象 |
| Business PhotoRef / original | server photo storage + local binary | 親Businessとbinary upload | 対象 |
| Device / DevicePrefix | server Device管理 | 対象外 | 対象外 |
| DeviceState / LocalSequence | local IndexedDB | 対象外 | 対象外 |
| Account表示名 / icon | server User | 対象外 | 対象外 |
| 認証session / TOTP | server auth | 対象外 | 対象外 |
| Theme / UI設定 | server User設定 | 対象外 | 対象外 |

## 3. Account icon / Theme wallpaper

Account iconとTheme wallpaperはBusiness PhotoRefではない。photoIdをBusiness parentに所属させる写真APIの仕様を流用しない。

保存方式、canonical化、サイズ上限、thumbnail有無、削除時のbinary cleanupは専用仕様が必要。無制限data URLのDB埋め込みは採用しない。

決定前に必要な確認:
- 実際の画像利用画面と解像度
- アップロード上限
- server storageとUser/Theme recordの参照関係
- 同一Userの複数Deviceからの取得とcache

## 4. Account / Theme DB不足

[DBスキーマ定義](./40_DBスキーマ定義.md)のBusiness/Sync/Restore/Device定義に対し、以下のserver schemaを確定する必要がある。

- User表示名、Account icon参照
- Theme id / userId / name / baseTheme / tokens / wallpaper参照
- UserSetting.activeTheme、uiSettings
- Theme削除時のactiveTheme fallback
- Account / Theme binary metadataとcleanup

具体的なPrisma modelはテストケース作成前に確定する。

## 5. Session

v0.8必須はlogin、現在session確認、logout。複数session一覧・個別失効は必須対象外。旧SyncToken deviceNameはBox.code Device nameとは別概念。

## 6. QR

QR payloadはBox.codeのみ。QR署名URLと公開Box lookup APIは不要。offlineではUser-local DBから検索し、onlineでは通常同期後に再検索する。

## 7. API共通error

API間で共通の意味を持つerrorは `invalid_request`、`unauthorized`、`not_found`、`conflict`、`internal_error` を基本とする。

認証試行制限 `too_many_attempts` と一般rate limit `too_many_requests` は用途を区別する。両者を同じ用途で混在させない。

## 8. 実装前の確認順

1. Account icon / Theme wallpaperのbinary保存方式を確定
2. User / Theme / UserSettingのDB field・制約を確定
3. API request / responseをfield単位で整合確認
4. 正式テストケース作成・レビュー
5. テスト実装
6. Prisma/API実装
7. 検証

未確定項目を暗黙の実装判断で確定しない。

[目次](../目次.md) > アーキテクチャ > API設計 > API / DB整合性確認
