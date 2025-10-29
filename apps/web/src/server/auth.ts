// 認証関連のサーバ関数（App Router対応）
// ポイント：Cookie "st" に保持する生トークンを SHA-256(hex) でDB照合

import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { sha256hex } from '@/server/crypto';

const COOKIE_NAME = 'st';

/** 現在のリクエストからユーザー情報を取得（なければ null） */
export async function getUser() {
  // Cookieに生トークン（URLセーフ文字列）が入っている想定
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return null;

  // DBは hex固定で保存・照合
  const tokenHash = sha256hex(raw);

  const t = await prisma.syncToken.findUnique({
    where: { tokenHash },
    select: {
      userId: true,
      expiresAt: true,
    },
  });
  if (!t) return null;
  if (t.expiresAt < new Date()) return null;

  const user = await prisma.user.findUnique({
    where: { id: t.userId },
    select: {
      id: true,
      userId: true,
      userName: true,
      isActive: true,
      totpEnabled: true,
    },
  });
  if (!user || !user.isActive) return null;

  // 参考：アクセス状況を非同期で更新（失敗は握りつぶす）
  prisma.syncToken
    .update({
      where: { tokenHash },
      data: {
        lastUsedAt: new Date(),
        userAgent: headers().get('user-agent') ?? undefined,
      },
    })
    .catch(() => {});

  return user;
}

/** 認証必須で userId を取りたい場合に使用（未認証なら例外） */
export async function requireUserId(): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error('unauthorized');
  return user.id;
}

// 互換用のエイリアス（既存コードが getUser を想定しているケースに対応）
export const getCurrentUser = getUser;

// パスワード関連をこのモジュール名で再公開して、既存 import '@/server/auth' を壊さない
export { hashPassword, verifyPassword } from './password';

/** 認証トークン（hash）を Cookie から取得。st 単体 または hk_sync 内の st= を許容 */
export function readAuthTokenFromCookies(): string | null {
  const jar = cookies();
  const st = jar.get('st')?.value;
  if (st) return st;

  const hk = jar.get('hk_sync')?.value;
  if (!hk) return null;

  // 例: "osOrd2F...; st=eNZt9p..." / "st=eNZt9p..." / "k=v&st=..." などを大雑把に抽出
  // セミコロンや空白区切りも考慮
  const m = hk.match(/(?:^|[;\s])st=([^;,\s]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
