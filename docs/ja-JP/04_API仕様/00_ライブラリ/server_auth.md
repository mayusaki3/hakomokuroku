[目次](../../目次.md) > API仕様 > ライブラリ > server/auth サーバー認証ライブラリ仕様

# server/auth サーバー認証ライブラリ仕様

## 1. 概要

本ドキュメントは、`apps/web/src/server/auth.ts` に実装されるサーバー認証ヘルパーライブラリ（以下、本ライブラリ）の仕様を定義する。

本ライブラリは **Next.js App Router（サーバーコンポーネント／API Route）からログインユーザー情報を取得するための共通ヘルパー** を提供し、個々の API 実装から Cookie 参照やエラー処理の重複を排除することを目的とする。

本ライブラリは HTTP エンドポイントではなく **サーバーサイド専用のライブラリ** であり、クライアントコンポーネントから直接呼び出すことは想定しない。

## 2. 責務

1. リクエストに付与されたセッション Cookie（`sid`）を基に、ログインユーザー情報を取得する。
2. 「ユーザー情報（`user`）をそのまま返す関数」と「必ずログイン済みであることを保証し、未ログインなら例外を投げる関数」の 2 系統の I/F を提供する。
3. 未ログイン時の挙動を統一する（`null` 返却 or `UNAUTHORIZED` 例外）。

## 3. 利用想定

- API Route（例：`/api/settings/user`）やサーバーコンポーネントから呼び出し、ログインユーザー情報にアクセスする。
- 「ログイン必須」の API では `requireUserId` を用いて認可チェックを共通化する。
- 「ログインしていればユーザー情報を付与、未ログインでも 200 で応答する」API では `getUser` を用いる。

## 4. 前提・依存

- 実行環境は Next.js App Router（Node.js ランタイム）。
- `next/headers` の `cookies()` を利用して `sid` クッキーを取得する。
- ユーザー情報の実体（`user` オブジェクト構造）は `/api/auth/me` などの認証 API と整合しているものとする。  
  （詳細フィールドは認証 API の仕様に追従。ここでは型名のみを定義し、フィールド詳細は認証 API 仕様に委譲する。）

依存モジュール（論理名）:

- `next/headers`
  - `cookies()`
- 認証バックエンド
  - 実装詳細は本ライブラリの責務外（例：`/api/auth/me` を叩く実装か、サーバー内のセッションストアを参照するかは実装依存）

## 5. 型定義（論理）

### 5.1 AuthUser（論理型）

`/api/auth/me` が返す `user` と同一構造の論理型。

- ここでは「**少なくとも以下のフィールドを持つ**」ことのみを保証する。
- 追加フィールドが存在してもよい（後方互換性のため）。

フィールド（最低保証）:

- `id: string`
  - ユーザーの一意な ID（DB 上の主キーまたはそれに準ずる値）
- `userName: string`
  - UI などで表示するユーザー名（表示名）

※ 追加フィールド（例：`totpEnabled` など）が存在する場合、認証 API 仕様にて定義する。

### 5.2 GetUserResult（論理型）

`getUser` の戻り値:

- `AuthUser | null`

意味:

- `AuthUser`:
  - ログイン済みかつセッション有効であり、ユーザー情報が取得できた状態。
- `null`:
  - セッションが存在しない／無効／ユーザーが見つからない等の理由により、ログインユーザー情報が取得できなかった状態。

## 6. 公開インターフェース一覧

本ライブラリは、少なくとも以下の関数を公開する。

1. `getUser(): Promise<AuthUser | null>`
2. `requireUserId(): Promise<string>`

（TypeScript の実装上は `export async function ...` による公開を想定）

## 7. 各関数仕様

### 7.1 getUser

#### 7.1.1 シグネチャ（論理）

- 関数名: `getUser`
- 引数: なし
- 戻り値: `Promise<AuthUser | null>`

#### 7.1.2 概要

- 現在のリクエストコンテキストに紐づくログインユーザー情報を取得する。
- 未ログインまたはセッションからユーザー情報を取得できない場合は `null` を返す。
- **未ログインを例外ではなく `null` で表現する点が重要**。

#### 7.1.3 詳細仕様

1. `next/headers` の `cookies()` を用いて `sid` クッキーを取得する。
   - クッキー名: `"sid"`
2. `sid` が存在しない場合:
   - 外部通信等は行わず、そのまま `null` を返す。
3. `sid` が存在する場合:
   - 内部的に認証バックエンドからユーザー情報を取得する。
   - 取得に成功し、ユーザー情報が存在する場合:
     - `AuthUser` オブジェクトを返す。
   - 取得に成功したがユーザー情報が存在しない場合（セッション無効など）:
     - `null` を返す。
4. 認証バックエンドとの通信エラー等の内部エラー時の扱い:
   - 原則として **ランタイムエラーをそのままスローする** 想定とする（実装に依存）。  
     （API から利用する場合は呼び出し元で try-catch し、500 系レスポンスに変換することを推奨。）

#### 7.1.4 例外

- 認証バックエンド呼び出しの失敗や JSON パースエラー等により、実装上 `Error` がスローされる可能性がある。
- 未ログイン（`sid` 不在）は **例外ではなく `null` 返却** で表現する。

#### 7.1.5 使用例（論理）

※ 実ファイルパスは `@/server/auth` を想定。

```ts
import { getUser } from '@/server/auth';

export async function GET() {
  const user = await getUser();

  if (!user) {
    // 未ログインでも 200 を返したい例
    return Response.json({ ok: false, user: null });
  }

  return Response.json({ ok: true, user });
}
```

### 7.2 requireUserId

#### 7.2.1 シグネチャ（論理）

- 関数名: `requireUserId`
- 引数: なし
- 戻り値: `Promise<string>`

#### 7.2.2 概要

- ログイン済みであることを **必須前提** とする API／処理向けのヘルパー。
- ログイン済みであればユーザー ID（`AuthUser.id`）を返す。
- 未ログインまたはセッション不整合時には `"UNAUTHORIZED"` メッセージを持つ例外をスローする。

#### 7.2.3 詳細仕様

1. 内部的に `getUser()` を呼び出し、ログインユーザー情報を取得する。
2. `getUser()` の戻り値が `null` の場合:
   - `new Error('UNAUTHORIZED')` 等、メッセージに `"UNAUTHORIZED"` を含む例外をスローする。
   - 特に、`sid` クッキーが存在しない場合はこの経路に入ることがテストで保証されている。
3. `getUser()` の戻り値が `AuthUser` の場合:
   - その `id` を `string` として返却する。
   - 返却時に追加の認可チェックは行わない（ロール別認可は別レイヤーの責務）。

#### 7.2.4 例外

- 未ログイン・セッション無効・その他の理由でユーザー情報が取得できない場合:
  - `"UNAUTHORIZED"` をメッセージとして含む `Error` をスローする。
- `getUser()` 自体が内部エラーで例外を投げた場合:
  - 当該例外をそのまま伝播させる（実装によってはラップする可能性あり）。

#### 7.2.5 使用例（論理）

```ts
import { requireUserId } from '@/server/auth';

export async function POST(req: Request) {
  // 未ログインならここで例外（UNAUTHORIZED）が投げられる
  const userId = await requireUserId();

  // ログイン済みユーザー専用処理
  const body = await req.json();
  // ... userId を用いた DB 更新など ...

  return Response.json({ ok: true });
}
```

## 8. エラー・例外ポリシー

- **未ログイン**:
  - `getUser`: `null` を返す。
  - `requireUserId`: `"UNAUTHORIZED"` 例外を投げる。
- **内部実装エラー（通信失敗、JSON パース失敗など）**:
  - ライブラリ内部で握りつぶさず、原則として例外を呼び出し元に伝播させる。
  - API 実装側で `try-catch` により 500 系レスポンスへ変換することを推奨。

## 9. テストとの対応関係

tests/server.auth.spec.ts で想定する主なテストケース（論理）:

- SERVER_AUTH-TC-01: `sid` クッキーあり + ユーザー情報取得成功 → `getUser` は `AuthUser` を返す。
- SERVER_AUTH-TC-02: `sid` クッキーなし → `getUser` は `null` を返す。
- SERVER_AUTH-TC-03: `sid` クッキーあり + ユーザー情報取得成功 → `requireUserId` は `AuthUser.id` を返す。
- SERVER_AUTH-TC-04: `sid` クッキーなし → `requireUserId` は `"UNAUTHORIZED"` を含む例外をスローする。

本仕様は上記テストケースに対応しており、テストコードの詳細は  
「05_テストケース集/00_ライブラリ/server_auth_testcases.md」および `tests/server.auth.spec.ts` を参照すること。

## 10. 関連ドキュメント

- 「05_テストケース集/00_ライブラリ/server_auth_testcases.md」
- 「05_テストケース集/01_ユーザー認証API/api_auth_me_testcases.md」
- 「04_API仕様/01_ユーザー認証API/api_auth_me.md」（存在する場合）

---
[目次](../../目次.md) > API仕様 > ライブラリ > server/auth サーバー認証ライブラリ仕様
