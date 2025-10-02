'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCurrentHeaderTitle } from '@/app/components/HeaderTitleContext';

function preserveParams(sp: ReadonlyURLSearchParams, href: string, keys = ['q','qr']) {
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
  if (path.startsWith('/settings')) return '設定';
  return '箱目録'; // ← ホームなどは必ずここにフォールバック
}

export default function Header() {
  const ctxTitleRaw = useCurrentHeaderTitle();
  const pathname = usePathname() || '/';
  const sp = useSearchParams();

  // 空文字・空白は null 扱いにして、パス推定に必ずフォールバック
  const ctxTitle = (ctxTitleRaw && ctxTitleRaw.trim().length > 0) ? ctxTitleRaw : null;
  const displayTitle = ctxTitle ?? mapTitleFromPath(pathname);

  const Btn = (p: { href: string; label: string; preserve?: boolean }) => (
    <Link href={p.preserve ? preserveParams(sp, p.href) : p.href} className="btn-link" prefetch>
      {p.label}
    </Link>
  );

  return (
    <header className="header">
      <div className="container header-grid">
        <div className="header-left">
          <Link href="/settings/backup" aria-label="アカウント/設定" title="設定">
            <div className="avatar">👤</div>
          </Link>
        </div>

        <div className="header-mid">
          <div className="title-row" aria-label="アプリタイトル">
            <img src="/favicon.svg" alt="" className="brandmark" />
            <div className="title-text">{displayTitle}</div>
          </div>
        </div>

        <nav className="header-right only-desktop nav-horizontal" aria-label="トップメニュー">
          <Btn href="/" label="ホーム" />
          <Btn href="/register" label="登録" />
          <Btn href="/boxes" label="箱リスト" preserve />
          <Btn href="/items" label="アイテムリスト" preserve />
          <Btn href="/help" label="ヘルプ" />
          <Btn href="/settings/backup" label="設定" />
        </nav>
      </div>
    </header>
  );
}
