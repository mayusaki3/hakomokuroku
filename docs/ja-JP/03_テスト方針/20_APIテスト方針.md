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

## 4. /api テスト

### 4.1 /api/user/icon について

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

## 6. カバレッジ方針

## 6.1 /app/api/user/icon/route.ts のカバレッジ方針

- `/app/api/user/icon/route.ts` は、アイコン更新 API の実装として、本番コードでも **行カバレッジ 100% を維持すること**を目標とする。  
- このエンドポイントは、次の 2 ファイルでテストされる。  
  - `tests/api.user.icon.spec.ts` … 正常系・エラー系・境界値を含む API テスト  
  - `tests/api.user.icon.hook-smoke.spec.ts` … `parseAndNormalizeDataURL` を実際に呼び出していること、および hook 経由の呼び出し経路を確認するスモークテスト
- `__hooks` を経由して `requireUserId` / `parseAndNormalizeDataURL` / `updateUserIcon` を呼び出す構成とし、テスト側では `vi.spyOn` と `vi.mock` を組み合わせて、  
  - 認証の成否  
  - dataURL の妥当性判定  
  - DB 更新結果（正常・対象なし・例外）  
  を個別に制御できるようにしている。
- Istanbul レポート上、Branch カバレッジは Prisma の例外分岐などの影響で 90% 台になるが、**行カバレッジ 100% を満たしていること**をもって、当該エンドポイントのカバレッジ要求を満たすものとする。Branch カバレッジを上げる目的だけで複雑なモックやダミーコードを追加しない。

---

---
[目次](../目次.md) > テスト方針 > APIテスト方針
