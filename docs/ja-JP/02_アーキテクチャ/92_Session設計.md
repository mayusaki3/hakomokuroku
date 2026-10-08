[目次](../目次.md) > アーキテクチャ > Session設計

# Session設計（v0.8）

## 1. 決定

認証は**DB保存型の不透明なランダムsession token**へ統一する。JWTや旧SyncTokenを認証sessionとして使用しない。Box.code用Deviceとは独立する。

- Cookie名: `hk_session`（`sid` と `hk_token` は廃止）
- token: 暗号学的乱数32 bytesをbase64urlで符号化。Cookieに平文token、DBにはSHA-256 digest（hex）だけを保存
- 有効期限: 発行時から30日、固定期限（アクセス時に自動延長しない）
- Cookie: `HttpOnly; SameSite=Lax; Path=/`。production HTTPSでは `Secure` 必須
- ログイン成功時に毎回新規sessionを発行。複数端末・複数sessionを許可。ログアウトは**現在のsessionのみ**失効
- 失効判定: DBの `revokedAt` がnull、`expiresAt > now`、Userが有効であることを毎回検証。期限切れは401
- 既存Cookieがある状態でログイン成功した場合、古い現在sessionを失効して新tokenに置換する
- 失効済み・期限切れsessionの削除は定期GCでよい（認証判定はGCに依存しない）
- `GET /api/auth/me` は `Cache-Control: no-store`。未ログイン応答は仕様80の `{ok:false,user:null}` を維持

## 2. Prisma model案

```prisma
model AuthSession {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  createdAt DateTime  @default(now())
  expiresAt DateTime
  revokedAt DateTime?
  lastSeenAt DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, expiresAt])
  @@index([expiresAt])
}
```

`User` 側に `authSessions AuthSession[]` を追加する。ここで `userId` はログイン名ではなく `User.id` を指す。AuthSessionはBusiness Sync/Backupの対象外。

## 3. 認証フロー

1. Register: User作成のみ。sessionを発行しない。
2. Password login（TOTP無効）: password検証後にsessionを作成し、Cookieを発行。
3. Password login（TOTP有効）: LoginChallengeのみ作成。session/Cookieを発行しない。
4. TOTPまたはRecovery Code login: challengeの有効期限・未使用を検証し、**同一DB transaction**でchallengeを消費、Recovery Code使用時は消費、session作成を行う。transaction成功後にCookie発行。
5. Logout: Cookieに対応するsessionを失効させ、Cookieを同属性・Pathで消去。既に失効済みなら冪等成功。
6. Protected API: 共通認証関数がsessionを照合し `User.id` を返す。request bodyのuserIdを権限判定に使わない。

## 4. セキュリティ・境界

- Cookie認証の状態変更APIではOrigin/Host検証を行い、許可Origin以外のcross-site requestを拒否する。SameSiteだけをCSRF対策の全てとしない。
- session tokenをURL、ログ、レスポンスJSON、Business payloadに含めない。
- DB tokenHashの照合に平文tokenを保存しない。Cookieを漏えいした場合は該当session失効で対処。
- reverse proxy経由でのHTTPS判定は信頼済みproxy設定のみを利用し、任意の `X-Forwarded-Proto` を信用しない。
- `lastSeenAt` の更新は任意・間引き可。認証の成否は `expiresAt` と `revokedAt` による。

## 5. テストゲート

`apps/web/tests/auth-session.contract.spec.ts` のAUTH-S01～S12を実装し、さらにsession tokenのdigest-only保存、期限境界、logout後Cookie消去、CSRF拒否、User削除cascadeを確認する。現時点で本番schema/APIは未変更。

[目次](../目次.md) > アーキテクチャ > Session設計
