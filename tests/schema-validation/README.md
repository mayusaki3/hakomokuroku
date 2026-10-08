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

**検証状態: 未実行**。このfixtureをGitHubへ追加したこと自体はPrisma validate成功を意味しない。正式なテストケース作成前に実行結果を記録する。

[目次](../../docs/ja-JP/目次.md) > アーキテクチャ > Prisma relation検証
