'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

function preserveParams(sp: ReadonlyURLSearchParams, href: string, keys = ['q', 'qr']) {
  const params = new URLSearchParams();
  for (const k of keys) { const v = sp.get(k); if (v) params.set(k, v); }
  const qs = params.toString();
  return qs ? `${href}?${qs}` : href;
}

export default function MobileTabBar() {
  const pathname = usePathname() || '/';
  const sp = useSearchParams();
  const isActive = (p: string) => (pathname === p || pathname.startsWith(p + '/'));

  return (
    <nav className="only-mobile tabbar" aria-label="ボトムメニュー"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50,
        height: 'var(--bottombar-h)', borderTop: '1px solid #eee', background: '#fff'
      }}>
      <ul style={{
        listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)',
        alignItems: 'center', margin: 0, padding: 0, height: '100%'
      }}>
        <li style={{ textAlign: 'center' }}>
          <Link href="/" aria-current={isActive('/') ? 'page' : undefined} className="tab-link">🏠<div className="tab-label">ホーム</div></Link>
        </li>
        <li style={{ textAlign: 'center' }}>
          <Link href="/register" aria-current={isActive('/register') ? 'page' : undefined} className="tab-link">✚<div className="tab-label">登録</div></Link>
        </li>
        <li style={{ textAlign: 'center' }}>
          <Link href={preserveParams(sp, '/boxes')} aria-current={isActive('/boxes') ? 'page' : undefined} className="tab-link">
            📦<div className="tab-label">箱</div>
          </Link>
        </li>
        <li style={{ textAlign: 'center' }}>
          <Link href={preserveParams(sp, '/items')} aria-current={isActive('/items') ? 'page' : undefined} className="tab-link">
            🧰<div className="tab-label">アイテム</div>
          </Link>
        </li>
        <li style={{ textAlign: 'center' }}>
          <Link href="/help" aria-current={isActive('/help') ? 'page' : undefined} className="tab-link">❓<div className="tab-label">ヘルプ</div></Link>
        </li>
        <li style={{ textAlign: 'center' }}>
          <Link href="/settings" aria-current={isActive('/settings') ? 'page' : undefined} className="tab-link">⚙️<div className="tab-label">設定</div></Link>
        </li>
      </ul>
    </nav>
  );
}
