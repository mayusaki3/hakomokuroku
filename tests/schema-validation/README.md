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
