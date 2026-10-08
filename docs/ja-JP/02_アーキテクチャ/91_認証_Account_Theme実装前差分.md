[目次](../目次.md) > アーキテクチャ > 認証・Account・Theme実装前差分

# 認証・Account・Theme実装前差分（2026-10-08）

## 1. 調査対象

developの `apps/web/prisma/schema.prisma`、`apps/web/src/lib/auth.ts`、`apps/web/src/lib/prisma.ts`、および仕様80・85・86・88・89を確認した。**全APIファイルの網羅調査ではない**ため、未確認箇所を「未実装」と断定しない。

## 2. 確認できた差分

| ID | 現行コード | v0.8仕様 | 対応 |
| --- | --- | --- | --- |
| AUTH-01 | `getCurrentUser()` が `hk_token` Cookieを読む | Session/Cookieを単一方式に統一 | session方式を先に確定 |
| AUTH-02 | `prisma.syncToken.findFirst()` を呼ぶ | 旧SyncTokenを認証正規方式にしない | 認証層を新方式へ置換 |
| AUTH-03 | 現行Prismaに `SyncToken` modelが無い | session認証の永続化が必要 | **現行helperは実行時エラー候補**。session modelのテストを先に作成 |
| AUTH-04 | auth.tsで `headers` import未使用 | 認証helperを単一化 | 実装時整理 |
| ACC-01 | `User.userName` | `User.displayName` | rename |
| ACC-02 | `User.iconDataUrl` | `User.iconImageId` | UserImage参照へ置換 |
| IMG-01 | `UserImage` modelなし | `(userId,id)`複合PK | 正式テスト後追加 |
| THEME-01 | `Theme.id` 単独PK | `(userId,id)`複合PK | FKを含め変更 |
| THEME-02 | `Theme.wallpaper Json?` | `wallpaperImageId String?` | UserImage参照へ置換 |
| SET-01 | `UserSetting.uiSettings Json?` | 必須Json（DB defaultなし） | 作成時 `{}` を明示 |
| DATA-01 | `Item.boxId String` 必須 | 未所属Itemのnullを許可 | 別のBusiness schema作業として扱う |

## 3. 実装順序とゲート

1. **AUTH**: 認証sessionの正規保存方式、cookie名、有効期限、logout失効、TOTP challenge→sessionを決める。先に認証テストケースを作る。
2. **DB**: production PrismaのUser / UserImage / Theme / UserSetting関係を変更。専用SQLiteでmigrationとFKテストを実施。既存DBへの破壊的変更前に移行・初期化方針を確認。
3. **Account**: `GET/PATCH /api/account` とicon参照更新を実装。認証helperを共用。
4. **UserImage**: upload / GET、binary保存、変換、状態遷移、GCをテストに従って実装。
5. **Theme**: wallpaper参照とactive Theme削除時fallbackを実装。
6. **連携**: 認証・User scope・Business Sync/Backup除外を統合試験。

AUTHを先行させないまま新APIから旧 `getCurrentUser` を呼ばない。

## 4. テスト方針

- UserImage API受入31件は `apps/web/tests/user-image.contract.spec.ts` のTODOに対応。
- isolated fixtureのVitest5件とSQLite FK smoke7件は成功済み。ただしproduction Prisma/APIの成功を意味しない。
- AUTHについて、sessionの作成・失効、cookie属性、TOTP未完了時session不発行、challenge再利用拒否、User scopeのテストを先に作る。
- API実装時にTODOを実テストへ置換し、未実装をPASSとして扱わない。

## 5. 未確定事項

- session保存先・Cookie名・TTL・rotation・同時session数（仕様80は単一化のみ確定）。
- 旧User.iconDataUrl / Theme.wallpaperを破棄するか移行するか（v0.8旧互換不要方針との整合）。
- 認証APIの現存route実装・依存箇所の全件確認（コード検索/ローカル調査が必要）。

[目次](../目次.md) > アーキテクチャ > 認証・Account・Theme実装前差分
