[目次](../目次.md) > アーキテクチャ > AuthSession移行手順

# AuthSession追加migrationの適用手順

対象: `apps/web/prisma/migrations/20261008172500_add_auth_session/migration.sql`。

## 前提と注意

- 開発・検証DBから先に実施する。本番DBはバックアップ・復旧手順が確認できるまで適用しない。
- このmigrationはAuthSessionテーブルとindexだけを追加し、既存のUser/Businessレコードは変更しない。
- `prisma migrate dev`、`prisma db push`、`prisma migrate reset` は**既存DBに対して使用しない**。
- `DATABASE_URL` はSQLite DBの絶対パスを指定する。以下は**利用者が実際の対象DBパスを確認して設定する**こと。テスト用 `auth-session-validation.db` や `relation-validation-v2.db` を指定しない。
- migrationはAPIのsession方式を切り替えない。現行APIの `sid`/`hk_token` は別途実装修正が必要。

## PowerShell手順（apps/web）

```powershell
git pull
# 対象DBの実パスを確認して置き換える（以下は例示変数であり、そのまま実行しない）
$dbPath = "D:\\<実際のDB保存先>\\hakomokuroku.db"
if (-not (Test-Path -LiteralPath $dbPath -PathType Leaf)) { throw "DB not found: $dbPath" }
$dbPath = (Resolve-Path -LiteralPath $dbPath).Path
$env:DATABASE_URL = "file:" + ($dbPath -replace '\\', '/')

# 実行対象を表示し、バックアップを取得（SQLiteのWAL利用時は単純ファイルコピーを避ける）
Write-Host "TARGET DATABASE: $dbPath"
python -c "import sqlite3,sys; src=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); dst=sqlite3.connect(sys.argv[2]); src.backup(dst); dst.close(); src.close()" $dbPath ($dbPath + ".pre-auth-session.bak")

# migration状態確認。未適用migrationが複数ある場合はここで停止して内容を精査
npx prisma migrate status --schema prisma/schema.prisma

# 適用前に専用のメモリSQLite検証を再実行
python ../../tests/schema-validation/check_auth_session_migration.py

# 既存DBのバックアップを確保できた場合に限り適用
npx prisma migrate deploy --schema prisma/schema.prisma

# 適用結果
npx prisma migrate status --schema prisma/schema.prisma
npx prisma validate --schema prisma/schema.prisma
```

SQLiteバックアップは `sqlite3.Connection.backup` を使用する。サービス稼働中はアプリ側の書き込みと適用の競合を避けるため、可能なら停止・保守モードで実施する。

## 適用後の確認

- `_prisma_migrations` に `20261008172500_add_auth_session` が成功状態で記録されている。
- `AuthSession` テーブルと3 indexが存在する。
- 既存User件数が適用前後で変わらない。
- `PRAGMA foreign_key_check` で違反がない。
- 既存ログインが動作するかは**このmigration検証の範囲外**。API改修後に認証受入テストを実施する。

[目次](../目次.md) > アーキテクチャ > AuthSession移行手順
