// apps/web/src/app/components/MobileTabBar.tsx
'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

function preserveParams(sp: ReadonlyURLSearchParams, href: string, keys = ['q', 'qr']) {
  const params = new URLSearchParams();
  for (const k of keys) {
    const v = sp.get(k);
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${href}?${qs}` : href;
}

export default function MobileTabBar() {
  const pathname = usePathname() || '/';
  const sp = useSearchParams();
  const isActive = (p: string) => pathname === p || pathname.startsWith(p + '/');

  return (
    <nav className="only-mobile mobile-tabbar" aria-label="ボトムメニュー">
      <ul className="tabbar-grid">
        <li>
          <Link href="/" aria-current={isActive('/') ? 'page' : undefined} className="tab-link">
            🏠<div className="tab-label">ホーム</div>
          </Link>
        </li>
        <li>
          <Link
            href="/register"
            aria-current={isActive('/register') ? 'page' : undefined}
            className="tab-link"
          >
            ✚<div className="tab-label">登録</div>
          </Link>
        </li>
        <li>
          <Link
            href={preserveParams(sp, '/boxes')}
            aria-current={isActive('/boxes') ? 'page' : undefined}
            className="tab-link"
          >
            📦<div className="tab-label">箱</div>
          </Link>
        </li>
        <li>
          <Link
            href={preserveParams(sp, '/items')}
            aria-current={isActive('/items') ? 'page' : undefined}
            className="tab-link"
          >
            🧰<div className="tab-label">アイテム</div>
          </Link>
        </li>
        <li>
          <Link
            href="/help"
            aria-current={isActive('/help') ? 'page' : undefined}
            className="tab-link"
          >
            ❓<div className="tab-label">ヘルプ</div>
          </Link>
        </li>
        <li>
          <Link
            href="/settings"
            aria-current={isActive('/settings') ? 'page' : undefined}
            className="tab-link"
          >
            ⚙️<div className="tab-label">設定</div>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
