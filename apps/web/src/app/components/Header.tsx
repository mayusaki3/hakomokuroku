// apps/web/src/app/components/Header.tsx
'use client';

import { useEffect, useState } from 'react';
import { useCurrentHeaderTitle } from './HeaderTitleContext';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

type Me = { iconDataUrl?: string | null };

const DEFAULT_USER_ICON = '/icons/user-default.svg';
const BRAND_ICON = '/icons/appicon.svg';

const DEFAULT_USER_ICON_DATAURL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
       <circle cx="32" cy="32" r="32" fill="#e5e7eb"/>
       <circle cx="32" cy="26" r="12" fill="#9ca3af"/>
       <path d="M12 54c4-10 16-14 20-14s16 4 20 14" fill="#9ca3af"/>
     </svg>`
  );

function preserveParams(sp: ReadonlyURLSearchParams, href: string, keys = ['q', 'qr']) {
  const params = new URLSearchParams();
  for (const k of keys) { const v = sp.get(k); if (v) params.set(k, v); }
  const qs = params.toString();
  return qs ? `${href}?${qs}` : href;
}

function mapTitleFromPath(path: string) {
  if (path.startsWith('/boxes')) return '箱リスト';
  if (path.startsWith('/items')) return 'アイテムリスト';
  if (path.startsWith('/register')) return '登録';
  if (path.startsWith('/help')) return 'ヘルプ';
  if (path.startsWith('/settings/user')) return 'ユーザー情報';
  if (path.startsWith('/settings')) return '設定';
  return '箱目録';
}

export default function Header() {
  const [me, setMe] = useState<Me | null>(null);
  const pathname = usePathname() || '/';
  const sp = useSearchParams();
  const injectedTitle = useCurrentHeaderTitle();

  async function loadMe() {
    const r = await fetch('/api/auth/me?cb=' + Date.now(), { cache: 'no-store', credentials: 'include', headers: { accept: 'application/json' } });
    if (!r.ok) { setMe(null); return; }
    const body = await r.json();             // { ok: boolean, user: {...} }
    setMe(body?.user ?? null);               // ← me に user を格納
  }
  useEffect(() => {
    loadMe();
    const onChanged = () => loadMe();
    const onLoggedOut = () => setMe(null);
    window.addEventListener('hk:me:changed', onChanged);
    window.addEventListener('hk:logged-out', onLoggedOut);
    return () => {
      window.removeEventListener('hk:me:changed', onChanged);
      window.removeEventListener('hk:logged-out', onLoggedOut);
    };
  }, []);
  useEffect(() => { loadMe(); }, [pathname]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') loadMe(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  useEffect(() => {
    const id = setInterval(loadMe, 30000);
    return () => clearInterval(id);
  }, []);

  const displayTitle = injectedTitle ?? mapTitleFromPath(pathname);
  const Btn = (p: { href: string; label: string; preserve?: boolean }) => (
    <Link href={p.preserve ? preserveParams(sp, p.href) : p.href} className="btn" prefetch>
      {p.label}
    </Link>
  );

  return (
    <header className="header">
      <div className="container header-grid">
        {/* 左：ユーザーアイコン */}
        <div className="header-left">
          <Link href="/settings/user" aria-label="設定/ユーザー情報" title="ユーザー情報">
            <img
              src={me?.iconDataUrl || DEFAULT_USER_ICON}
              alt="user"
              width={36}
              height={36}
              className="rounded-full"
              style={{ objectFit: 'cover', display: 'block' }}
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = DEFAULT_USER_ICON_DATAURL; }}
            />
          </Link>
        </div>

        {/* 中央：タイトル（常にセンタリング */}
        <div className="header-mid">
          <div className="title-row" aria-label="アプリタイトル" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <img src={BRAND_ICON} alt="" width={24} height={24} style={{ display: 'block' }}
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/favicon.ico'; }} />
            <div className="title-text">{displayTitle}</div>
          </div>
        </div>

        {/* 右：PCメニュー */}
        <nav className="header-right only-desktop nav-horizontal" aria-label="トップメニュー">
          <Btn href="/" label="ホーム" />
          <Btn href="/register" label="登録" />
          <Btn href="/boxes" label="箱リスト" preserve />
          <Btn href="/items" label="アイテムリスト" preserve />
          <Btn href="/help" label="ヘルプ" />
          <Btn href="/settings" label="設定" />
        </nav>
        {/* モバイル用スペーサー（右側の見かけ幅を作り中央を画面基準に） */}
        <div className="header-spacer only-mobile" aria-hidden />
      </div>
    </header>
  );
}