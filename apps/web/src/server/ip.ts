// apps/web/src/server/ip.ts
// クライアントIPの抽出ヘルパ（プロキシ/トンネル配下を考慮）

import { headers } from 'next/headers';

export function getClientIp(): string | undefined {
  const h = headers();
  return (
    h.get('cf-connecting-ip') ??
    h.get('x-forwarded-for')?.split(',')[0].trim() ??
    h.get('x-real-ip') ??
    undefined
  );
}
