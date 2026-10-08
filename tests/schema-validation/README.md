# Prisma relation検証

[目次](../../docs/ja-JP/目次.md) > アーキテクチャ > Prisma relation検証

v0.8 Account / Theme / UserImageのrelationを本番schemaから切り離して確認する。

## 手順

リポジトリルートで実行する。

```powershell
$env:DATABASE_URL = "file:./relation-validation.db"
cd apps/web
npx prisma validate --schema ../../tests/schema-validation/user-image-relations.prisma
npx prisma format --check --schema ../../tests/schema-validation/user-image-relations.prisma
```

`format --check` がPrismaバージョンで非対応なら `validate` を判定基準とし、formatは変更を生じるため別途実行する。

## 判定

- validateが成功: Prisma relation構文の成立のみ確認できた状態。SQLiteのmigration生成と実DBのFK挙動は別途検証する。
- validateが失敗: error全文を記録し、User icon参照の循環関係・relation名・複合FK・Json defaultの順で修正する。
- migrationで循環FKが不成立: UserImage側のunique account owner方式を代替案として比較し、設計文書更新後に採用する。

**検証状態: Prisma validate成功（2026-10-08、Windows / Prisma CLI）**。ユーザー実行ログに `The schema at ..\\..\\tests\\schema-validation\\user-image-relations.prisma is valid` を確認。Prisma構文検証のみ成功であり、SQLiteのmigration SQL生成・FK挙動は未検証。`package.json#prisma` 非推奨警告は成功判定に影響しない。

次の検証（DBを変更せずSQLを標準出力へ生成）:

```powershell
npx prisma migrate diff --from-empty --to-schema-datamodel ../../tests/schema-validation/user-image-relations.prisma --script
```

CLIバージョンにより引数が非対応なら `npx prisma migrate diff --help` の出力を確認し、適切な引数へ修正する。生成されたSQLの `User`、`UserImage`、`Theme` の `FOREIGN KEY` と `ON DELETE` を点検する。

[目次](../../docs/ja-JP/目次.md) > アーキテクチャ > Prisma relation検証

## SQL生成結果（2026-10-08）

Windows上で `npx prisma migrate diff --from-empty --to-schema-datamodel ../../tests/schema-validation/user-image-relations.prisma --script` 成功。以下を確認した。

- `User(id, iconImageId)` → `UserImage(userId, id)`: `ON DELETE NO ACTION`
- `UserImage.userId` → `User.id`: `ON DELETE CASCADE`
- `Theme(userId, wallpaperImageId)` → `UserImage(userId, id)`: `ON DELETE NO ACTION`
- `Theme.userId` → `User.id`: `ON DELETE CASCADE`
- `UserSetting.uiSettings`: `JSONB NOT NULL DEFAULT {}`

**結果: migration SQL生成成功、実DBへの適用とFK挙動は未検証。**

### 次の実DB検証（専用の一時SQLite）

```powershell
# apps/web から実行。既存DBを触らないため絶対パスを使う。
$env:DATABASE_URL = "file:D:/WORKPLACE/Makes/GitHub/hakomokuroku/tests/schema-validation/relation-validation.db"
npx prisma db push --schema ../../tests/schema-validation/user-image-relations.prisma --skip-generate
```

実行前に指定した専用DBが存在しないことを確認する。Prismaが既存DBのresetを提案したら中断する。成功後にFK制約のINSERT/DELETE検証を行う。

## SQLite db push失敗と修正（2026-10-08）

最初の専用DBで `db push` が `unrecognized token: "{"` により失敗。原因は `uiSettings Json @default("{}")` がSQLiteで `DEFAULT {}` に変換されたこと。`uiSettings Json`（必須、DB defaultなし）へ変更し、UserSetting作成時にアプリから空objectを明示する。

失敗した `relation-validation.db` は再利用しない。次は新規 `relation-validation-v2.db` を使用する。

```powershell
$testDb2 = "D:\\WORKPLACE\\Makes\\GitHub\\hakomokuroku\\tests\\schema-validation\\relation-validation-v2.db"
Test-Path $testDb2
# Falseのときのみ以下を実行
$env:DATABASE_URL = "file:D:/WORKPLACE/Makes/GitHub/hakomokuroku/tests/schema-validation/relation-validation-v2.db"
npx prisma validate --schema ../../tests/schema-validation/user-image-relations.prisma
npx prisma db push --schema ../../tests/schema-validation/user-image-relations.prisma --skip-generate
```
