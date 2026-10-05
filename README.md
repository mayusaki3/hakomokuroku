# hakomokuroku — 箱の目録・QRラベル管理

## 目的
引っ越し・片づけ時に、箱の中身を写真＆テキストで記録し、QRで素早く参照・検索するPWA。

## 現在のMVP
- 撮影フロー: アイテム先撮り → 箱確定＆QR発行 → 箱外観撮影
- IndexedDB保存（Dexie）/ オフライン対応（PWA）
- QR(SVG)生成 / 24mmテープ向けレイアウト

## 使い方（開発）

### 1. 初回 / 新環境の構築

前提:
- Node.js / pnpm が利用可能
- `apps/web/.env` の `DATABASE_URL="file:./dev.db"` を使用
- server DB は SQLite + Prisma

```powershell
# リポジトリルート
pnpm i

# Prisma Client生成
pnpm -C apps/web exec prisma generate --schema=prisma/schema.prisma

# migrationから新規DBを構築
pnpm -C apps/web exec prisma migrate dev --schema=prisma/schema.prisma

# Web起動
pnpm -C apps/web dev
```

ブラウザ:
```text
http://localhost:3000
```

外部端末からHTTPSで確認する場合のみ:
```powershell
cloudflared tunnel --url http://localhost:3000
```

### 2. 旧開発環境を完全に削除して作り直す

v0.8は旧開発DBとの互換を持たない。仕切り直し時は旧DBをmigrationせず削除してよい。

最初に `pnpm dev`、Prisma Studio、cloudflared を停止する。

```powershell
# リポジトリルートから実行
Remove-Item -Force apps/web/prisma/dev.db -ErrorAction SilentlyContinue
Remove-Item -Force apps/web/prisma/dev.db-journal -ErrorAction SilentlyContinue
Remove-Item -Force apps/web/prisma/dev.db-shm -ErrorAction SilentlyContinue
Remove-Item -Force apps/web/prisma/dev.db-wal -ErrorAction SilentlyContinue
```

ブラウザ側も旧local generationを残さない場合は、対象origin
（通常 `http://localhost:3000`、および過去に利用したcloudflared URL）について
DevTools → Application → Storage → **Clear site data** を実行する。

これにより主に以下を削除する。
- IndexedDB / Dexie local DB
- Local Storage
- Cache Storage
- Service Worker
- Cookie / session

その後「1. 初回 / 新環境の構築」を実行する。

> 注意: local DB削除は未同期データも失う。v0.8仕切り直し時の旧開発環境削除に限って行う。

### 3. Prisma Studio

```powershell
pnpm -C apps/web exec prisma studio --schema=prisma/schema.prisma
```

```text
http://localhost:5555
```

### 4. 単体テスト

通常実行:
```powershell
pnpm -C apps/web exec vitest --run --coverage --config vitest.config.mts
```

テスト番号を表示:
```powershell
pnpm -C apps/web exec vitest --run --coverage --config vitest.config.mts --reporter=verbose
```

### 5. v0.8再構築時の注意

`apps/web/prisma/schema.prisma` と `apps/web/prisma/seed.js` には旧実装由来の定義が残っている場合がある。
新しい初期DBを作る前に、`docs/ja-JP/02_アーキテクチャ/40_DBスキーマ定義.md` を正として
Prisma schema / initial migration / seedを一致させる。

旧schemaのまま `prisma db seed` を実行しない。

