[目次](../../目次.md) > テストケース集 > APIテストケース集 > /api/user/icon テストケース

# /api/user/icon テストケース

## 1. 対象エンドポイント

- HTTP メソッド: `PUT`  
- パス: `/api/user/icon`  
- リクエストボディ: JSON

^^^json
{
  "dataURL": "data:image/png;base64,AAAA..."
}
^^^

- dataURL は `image/png` の `data:` URL（base64）形式のみ許可する。

## 2. 前提条件

- 認証方式は既存のセッション／クッキー方式に従う。  
- テストでは、`__hooks.requireUserId` をモックして「ログイン状態／未ログイン／例外発生」を制御する。  
- DB アクセスは、原則として `__hooks.updateUserIcon` をモックすることで、  
  - 正常更新  
  - 対象なし（例外）  
  - `updateMany` 相当の `{ count: number }`  
  をテストできるようにしている。  

## 3. テストケース一覧（api.user.icon.spec.ts）

Vitest によるテスト (`tests/api.user.icon.spec.ts`) と、テストケースの対応表を示す。

| No | テスト名（it） | 主な前提・入力 | 期待ステータス | 主な確認内容 |
|----|----------------|----------------|----------------|--------------|
| 01 | dataURL を保存し、{ ok:true, me } を返す | ログイン済み / 正常な PNG dataURL / DB 更新成功 | 200 | 正常系。`ok:true` と `me.id === userId` を返す。`updateUserIcon` が正しい引数で呼ばれること。 |
| 02 | PUT /api/user/icon > 未ログインは 401/403 相当 | `requireUserId` が null もしくは falsy を返す | 401 or 403 | 未ログイン（セッション切れ）時に 401/403 を返すこと。 |
| 03 | dataURL 未指定は 400 | JSON ボディに `dataURL` が存在しない | 400 | バリデーションエラーとして 400 を返すこと。 |
| 04 | DB 更新失敗は 500 系 | `updateUserIcon` が例外を投げる | 500 系 | DB 例外を 500 系エラーとして扱うこと。 |
| 05 | dataURL が不正形式（例: text/plain）なら 400 | `data:text/plain;base64,...` など不正 MIME | 400 | `parseAndNormalizeDataURL` により MIME 不正を検出し 400 を返す。 |
| 06 | 未ログインは 401 or 403 を返す | `requireUserId` が falsy を返すパターン | 401 or 403 | No.02 と同様だが、別経路の未ログインケースをカバー。 |
| 07 | 認証処理が例外なら 401 or 403 を返す | `requireUserId` が例外を投げる | 401 or 403 | 認証モジュール例外時に 401/403 へ正しくマッピングされること。 |
| 08 | Content-Type 不正は 400/415 | `content-type` が `application/json` 以外 | 400 or 415 | JSON 以外の Content-Type を拒否すること。実装では 400 固定だが 415 も許容。 |
| 09 | 壊れた JSON は 400 | JSON パース不能なボディ | 400 | `req.json()` で例外発生時に 400 を返すこと。 |
| 10 | Base64 不正は 400 | base64 デコード不能な dataURL | 400 | `BAD_BASE64` と判定され、400 になること。 |
| 11 | Base64に改行や空白が含まれていても許容 | base64 部分に改行や空白を含む | 200 or 400 | 空白除去ロジックが動作し、必要に応じて成功 / 失敗を返すこと。 |
| 12 | JPEGは拒否（mime不正） | `data:image/jpeg;base64,...` | 400 | MIME チェックにより JPEG が拒否されること。 |
| 13 | DBで対象ユーザー無しなら 404 | Prisma 例外（NotFoundError / P2025 相当） | 404 | 例外メッセージから「対象なし」と判定し、404 を返すこと。 |
| 14 | data: スキームでない dataURL は 400 | `http:` など data: 以外のスキーム | 400 | `BAD_SCHEME` として 400 になること。 |
| 15 | Base64 の decode 中に例外が出た場合は 400 | `Buffer.from(..., 'base64')` が例外 | 400 | base64 デコード中例外を 400 として扱うこと。 |
| 16 | dataURL が文字列以外なら 400 | `dataURL` に number / object などを渡す | 400 | 型チェック（string 判定）が機能していること。 |
| 17 | 予期せぬエラーは 500 を返す | handler 全体で予期せぬ例外を発生させる | 500 | 最上位の try-catch で 500 を返すこと。 |
| 18 | dataURL のbase64部が空なら 400 | `data:image/png;base64,` のように base64 部分が空 | 400 | `EMPTY_BASE64` と判定されること。 |
| 19 | DBで対象ユーザーが存在せず更新0件なら 404 | `updateUserIcon` が `{ count: 0 }` を返す | 404 | `updateMany` 相当のインターフェースに対して、`count===0` を 404 として扱うこと。 |
| 20 | 内部で予期せぬ例外なら 500 | DB 更新処理内部で想定外例外を発生させる | 500 | Prisma コード／メッセージに該当しない例外を 500 として扱うこと。 |

## 4. フック検証テスト（api.user.icon.hook-smoke.spec.ts）

`tests/api.user.icon.hook-smoke.spec.ts` では、次の点のみを狙って検証する。

- `parseAndNormalizeDataURL` が **`__hooks.parseAndNormalizeDataURL` 経由で 1 回だけ呼ばれていること**。  
- `requireUserId` / `updateUserIcon` をモックしつつ、API 全体が `200` で終了すること（モックされた DB 更新が成功パスに入ること）。  
- spy を `vi.spyOn(mod, 'parseAndNormalizeDataURL')` で張り、`expect(parseSpy).toHaveBeenCalledTimes(1)` を確認する。

このテストにより、

- ルートモジュール側で `parseAndNormalizeDataURL` を直接呼ばず、必ず `__hooks` 経由で呼び出す  
- 今後フック構成を変更した際も、spy が外れていないことを検出できる  

という性質を保証する。

## 5. 備考

- `__debug_counts` はデバッグ用のカウンタであり、本番コードでは利用しない。  
  - テスト中に「どの経路が通ったか」を一時的に確認する目的で導入した。  
  - 将来的に不要になった場合は、テストが十分に安定していることを確認したうえで削除してよい。  
- `/app/api/user/icon/route.ts` のカバレッジは Istanbul レポート上で  
  - Statements: 100%  
  - Lines: 100%  
  - Branches: 90% 台  
  となるが、Branch カバレッジ低下の要因は Prisma 例外分岐など実運用上ほぼ到達しないパスであり、テスト方針としては **行カバレッジ 100%** を優先して評価する。

---
[目次](../../目次.md) > テストケース集 > APIテストケース集 > /api/user/icon テストケース
