'use client';

export default function Header() {
  const LinkBtn = (p: { href: string; label: string }) => (
    <a href={p.href} className="btn-link">{p.label}</a>
  );

  return (
    <header className="header">
      <div className="container header-grid">
        {/* 左：ユーザー（設定へ） */}
        <a href="/settings/backup" aria-label="アカウント/設定" title="設定">
          <div className="avatar">👤</div>
        </a>

        {/* 中央：ロゴ＋タイトル */}
        <div className="title-row" aria-label="アプリタイトル">
          {/* 作成したfavicon.svgをそのまま使います */}
          <img src="/favicon.svg" alt="" className="brandmark" />
          <div className="title-text">箱目録</div>
        </div>

        {/* 右：PCのみメニュー */}
        <nav className="only-desktop nav-horizontal" aria-label="トップメニュー">
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
