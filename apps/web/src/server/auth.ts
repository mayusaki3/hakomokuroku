// apps/web/src/server/auth.ts
// 認証ヘルパ群。Cookie発行・検証、ユーザ取得、互換エクスポートを提供。
// 依存: prismaクライアント, passwordユーティリティ, Next.js headers/cookies

import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyPassword, hashPassword } from '@/server/password';

// === Cookie名・期限 ===
export const SESSION_COOKIE_NAME = 'st';                 // セッショントークン（平文）
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;          // 30日

// === セッショントークン生成 ===
export function randomUrlSafe(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

// === セッショントークンのSHA-256 ===
export function sha256hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// === UA/IP 抽出（最低限）
export function getRequestUA(): string | undefined {
  const h = headers();
  return h.get('user-agent') ?? undefined;
}
export function getRequestIP(): string | undefined {
  const h = headers();
  // Cloudflare等が付与する代表例
  return (
    h.get('cf-connecting-ip') ??
    h.get('x-forwarded-for')?.split(',')[0].trim() ??
    h.get('x-real-ip') ??
    undefined
  );
}

// === Cookie発行（Cloudflareトンネル対応: Domain未指定, Secure+SameSite=None 必須）
export function buildSessionSetCookie(token: string, expiresAt: Date): string {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
    'HttpOnly',
    'Secure',
    'SameSite=None',
  ].join('; ');
}

// === Cookieから平文セッション取得 ===
export function readSessionCookie(): string | undefined {
  return cookies().get(SESSION_COOKIE_NAME)?.value;
}

// === セッション検証して userId を返す（存在かつ期限内） ===
// - DB: syncToken(tokenHash, userId, expiresAt) を参照
// - ヒット時は lastUsedAt / UA / IP を簡易更新
export async function getUserIdFromSession(): Promise<string | null> {
  const st = readSessionCookie();
  if (!st) return null;
  const tokenHash = sha256hex(st);

  const tok = await prisma.syncToken.findFirst({
    where: { tokenHash },
    select: { userId: true, expiresAt: true },
  });
  if (!tok) return null;
  if (tok.expiresAt <= new Date()) return null;

  // ついでにアクセス情報の更新（最小限）
  await prisma.syncToken.updateMany({
    where: { tokenHash },
    data: { lastUsedAt: new Date(), userAgent: getRequestUA(), ip: getRequestIP() },
  });

  return tok.userId;
}

// === 認証必須: user を取得（401は呼び出し側で返す想定） ===
export async function requireUserId(): Promise<string> {
  const uid = await getUserIdFromSession();
  if (!uid) throw new Error('UNAUTHORIZED');
  return uid;
}

/* =========================================================
 * 追加: /api/auth/me 用のセッションリーダ
 * =========================================================
 * 目的:
 *  - API ルート `src/app/api/auth/me/route.ts` が import する named export `readSession`
 *  - 既存のセッショントークン検証ロジック（getUserIdFromSession）をそのまま利用
 * 返却形:
 *  - UI 側の MeResp を満たす最小構成（id/userId は同値。他フィールドは未実装のため null/false）
 *  - 将来、ユーザ詳細を DB から解決する実装に差し替え可能（TODO 参照）
 */
export type SessionUser = {
  id: string;
  userId: string;
  userName: string | null;
  iconDataUrl: string | null;
  totpEnabled: boolean;
};

// /api/auth/me 向け：DBからユーザー詳細を解決（id と userId は別カラム）
// ※ SessionUser 型が未定義の場合は、先に同ファイル内に定義してください。
export async function readSession(): Promise<{ user: SessionUser | null }> {
  const uid = await getUserIdFromSession();
  if (!uid) return { user: null };

  try {
    // ユーザー削除・無効化は未ログイン扱い（isActive=true のみ許可）
    const u = await prisma.user.findFirst({
      where: { id: uid, isActive: true },
      select: {
        id: true,
        userId: true,        // 公開ID（別カラム）
        userName: true,
        iconDataUrl: true,   // そのまま返す
        totpEnabled: true,
      },
    });
    if (!u) return { user: null };

    return {
      user: {
        id: u.id,
        userId: u.userId,
        userName: u.userName ?? null,
        iconDataUrl: u.iconDataUrl ?? null,
        totpEnabled: !!u.totpEnabled,
      },
    };
  } catch (err) {
    // 6. ユーザーへの露出は最小（API側で { user:null }）、詳細はサーバーログへ
    console.error('readSession failed', err);
    return { user: null };
  }
}

// === 互換エクスポート ===
// 既存コードが getUser を期待しているケースに対応（requireUserId 同等として提供）
export const getUser = requireUserId;

// password系はここから再エクスポート（API側が '@/server/auth' をimportしても動く）
export { verifyPassword, hashPassword };
