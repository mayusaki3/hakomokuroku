// apps/web/src/app/(authed)/layout.tsx
'use client';

import { useEffect, useRef } from 'react';

function handle401() {
  try { localStorage.removeItem('hk.sync'); } catch {}
  // Cookie掃除
  document.cookie = 'hk_token=; Path=/; Max-Age=0; SameSite=Lax';
  const next = location.pathname + location.search;
  location.replace(`/auth?next=${encodeURIComponent(next)}`);
}

async function ping() {
  try {
    const r = await fetch('/api/auth/me', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (r.status === 401) return handle401();
    // JSONでもし落ちないように
    if (r.ok) await r.json().catch(() => {});
  } catch {
    // ネットワーク失敗時は何もしない（PWA/オフライン想定）
  }
}

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const once = useRef(false);
  useEffect(() => {
    if (!once.current) { once.current = true; ping(); }
    // タブ復帰時も再確認
    const onVis = () => { if (document.visibilityState === 'visible') ping(); };
    window.addEventListener('visibilitychange', onVis);
    return () => window.removeEventListener('visibilitychange', onVis);
  }, []);
  return <>{children}</>;
}
