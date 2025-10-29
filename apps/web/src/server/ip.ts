// クライアントIP取得ヘルパ（cloudflared / 逆プロキシ対応）
import type { NextRequest } from 'next/server';

function firstForwardedFor(v: string | null): string | undefined {
  if (!v) return undefined;
  // "client, proxy1, proxy2" → 最初の要素
  const first = v.split(',')[0]?.trim();
  return first || undefined;
}

/** ヘッダ優先順位:
 *  X-Forwarded-For → CF-Connecting-IP → X-Real-IP → req.ip相当（ない場合はundefined）
 */
export function getClientIp(req: NextRequest | { headers: Headers }): string | undefined {
  const h = 'headers' in req ? req.headers : undefined;
  if (!h) return undefined;

  // 1) 逆プロキシの標準
  const xff = firstForwardedFor(h.get('x-forwarded-for'));
  if (xff) return xff;

  // 2) cloudflared / Cloudflare
  const cf = h.get('cf-connecting-ip') || h.get('cf-connecting-ipv6');
  if (cf) return cf;

  // 3) 一部プロキシ
  const xr = h.get('x-real-ip');
  if (xr) return xr;

  // 4) NextRequest に ip 相当は無いので undefined
  return undefined;
}
