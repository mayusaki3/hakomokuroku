[目次](../目次.md) > テスト方針 > APIテスト方針

# APIテスト方針

## 1. 目的

Next.js API Routes（/api/**）の入出力・分岐・認証・DB 更新の正しさを保証する。

## 2. 種別

- **APIユニットテスト**  
  Prisma／外部 API を完全モック。  
  バリデーション・分岐ロジックの網羅を目的とする。

- **API統合テスト**  
  Prisma＋テスト用DB＋seed データで実行。  
  DB の永続化結果まで含めて検証。

## 3. Prisma とテストデータ

### 3.1 Prisma モック（API UT）

- 更新件数  
- NotFound  
- DBエラー  
などを自由に作れるため、分岐の網羅に最適。

### 3.2 実DB（API 統合）

- テスト用DBに対し、seed でユーザー/箱/アイテムを投入。  
- テスト後は truncate または reseed。  
- 実際のスキーマ変更の回帰を検出できる。

## 4. /api/user/icon について

- `api.user.icon.spec.ts`：完全にモックベースの API UT  
  - dataURL フォーマット  
  - MIME 不正  
  - Base64 不正  
  - 認証エラー  
  - DBエラー  
  を網羅。

- `api.user.icon.hook-smoke.spec.ts`：  
  モック Prisma が route.ts 内で正しく呼ばれるかを確認。

- 将来的には実DBの API 統合テストを主流とする。  
  hook-smoke は回帰検知用に縮小。

## 5. 書き方ルール

- 1テスト = 1観点  
- ステータスコードは **必ず明示的にチェック**  
- 重要な場合のみ mock の呼び出し内容を確認  
- 予期せぬ例外のテストも最低1ケース含める

---
[目次](../目次.md) > テスト方針 > APIテスト方針
