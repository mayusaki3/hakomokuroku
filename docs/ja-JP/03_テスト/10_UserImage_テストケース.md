[目次](../目次.md) > テスト > UserImageテストケース

# UserImage正式テストケース（v0.8）

## 1. 範囲

Account icon、Theme wallpaper、UserImage storage、API、Prisma relation。Business PhotoRef・同期・利用者Backupには含めない。実装前の仕様テストであり、実行結果ではない。

## 2. 前提

- User A、User Bを別々に登録
- A所有のACCOUNT_ICON画像とTHEME_WALLPAPER画像
- READYとSTAGINGのUserImage
- PNG/JPEG/WebP入力、破損画像、巨大画像
- 検証用SQLite（本番DBを使用しない）

## 3. テストケース

| ID | 対象 | 操作・入力 | 期待結果 |
| --- | --- | --- | --- |
| UI-001 | Upload | PNG/JPEG/WebP正常画像 | 201、WebP canonical、hash/寸法/byteLength記録 |
| UI-002 | Upload | 入力10MiB超 | 413、画像・参照の変更なし |
| UI-003 | Upload | 非対応MIME | 415 |
| UI-004 | Upload | MIME偽装・破損binary | 422 invalid_image |
| UI-005 | Upload | 8192px超またはdecode上限超 | 422、処理停止 |
| UI-006 | Icon変換 | 最大辺256px、256KiB以内 | 条件内に縮小・再符号化 |
| UI-007 | Wallpaper変換 | 最大辺1920px、2MiB以内 | 条件内に縮小・再符号化 |
| UI-008 | Upload | binary保存失敗 | 500、既存参照維持、READYにならない |
| UI-009 | GET | 自分のREADY画像 | 200 image/webp、private cache、ETag |
| UI-010 | GET | If-None-Match一致 | 304 |
| UI-011 | GET | 別User画像 | 404 |
| UI-012 | Account | 自分のREADY ACCOUNT_ICONを設定 | 200、iconImageId更新 |
| UI-013 | Account | THEME_WALLPAPERをアイコン指定 | 拒否、参照変更なし |
| UI-014 | Account | STAGING画像を指定 | 拒否、参照変更なし |
| UI-015 | Account | 別User画像を指定 | 404、参照変更なし |
| UI-016 | Account | アイコン解除 | 参照null、画像はGC猶予へ |
| UI-017 | Theme | 自分のREADY THEME_WALLPAPERを指定 | 更新成功 |
| UI-018 | Theme | ACCOUNT_ICONを壁紙指定 | 拒否、参照変更なし |
| UI-019 | Theme | STAGING・別User画像を指定 | 拒否、参照変更なし |
| UI-020 | Theme | active Theme削除 | activeThemeがbuiltin:systemへ同時更新 |
| UI-021 | GC | 参照中画像 | 削除しない |
| UI-022 | GC | 参照解除から7日未満 | 削除しない |
| UI-023 | GC | 未参照で猶予経過 | binaryとmetadataを安全に回収 |
| UI-024 | DB FK | cross-user icon / wallpaper参照 | FKで拒否 |
| UI-025 | DB FK | 参照中UserImage物理削除 | FKで拒否 |
| UI-026 | DB FK | User削除 | 画像・Themeをcascade削除 |
| UI-027 | Account | displayName trim + NFC | 正規化して保存・返却 |
| UI-028 | Account | userId変更を含むPATCH | 400、ログイン識別子不変 |
| UI-029 | Offline | cache済み画像 | cache表示、Business Outbox不変 |
| UI-030 | Offline | cache無し | 既定icon・壁紙なし表示 |
| UI-031 | Scope | Business Pull / Backup | UserImageを含めない |

## 4. 判定・記録

各テストで入力、HTTP status/error、DB参照、binary実体、rollback/GCの状態を記録する。APIの拒否時error codeは実装前に統一する。未実装はPASS扱いにしない。

## 5. 既実施の検証

2026-10-08にisolated Prisma schema validate、SQLite db push、FK smoke 7項目成功。これらは上記正式テストの実施済み判定ではなく、設計の実現可能性検証として扱う。

[目次](../目次.md) > テスト > UserImageテストケース
