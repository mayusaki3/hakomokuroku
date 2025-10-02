'use client';
import { useCurrentHeaderTitle } from '@/app/components/HeaderTitleContext';

export default function Header() {
  const currentTitle = useCurrentHeaderTitle();
  const LinkBtn = (p: { href: string; label: string }) => (
    <a href={p.href} className="btn-link">{p.label}</a>
  );

  return (
    <header className="header">
      <div className="container header-grid">
        <div className="header-left">
          <a href="/settings/backup" aria-label="アカウント/設定" title="設定">
            <div className="avatar">👤</div>
          </a>
        </div>

        <div className="header-mid">
          <div className="title-row" aria-label="アプリタイトル">
            <img src="/favicon.svg" alt="" className="brandmark" />
            <div className="title-text">{currentTitle}</div>
          </div>
        </div>

        <nav className="header-right only-desktop nav-horizontal" aria-label="トップメニュー">
          <LinkBtn href="/" label="ホーム" />
          <LinkBtn href="/register" label="登録" />
          <LinkBtn href="/boxes" label="箱リスト" />
          <LinkBtn href="/items" label="アイテムリスト" />
          <LinkBtn href="/help" label="ヘルプ" />
          <LinkBtn href="/settings/backup" label="設定" />
        </nav>
      </div>
    </header>
  );
}
