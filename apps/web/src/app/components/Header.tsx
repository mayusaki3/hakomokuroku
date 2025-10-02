'use client';
export default function Header() {
  const LinkBtn = (p: { href: string; label: string }) => (
    <a href={p.href} style={{
      padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8,
      textDecoration: 'none', color: '#111827', background: '#fff'
    }}>{p.label}</a>
  );

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 40,
      background: 'rgba(255,255,255,0.9)', backdropFilter: 'saturate(180%) blur(8px)',
      borderBottom: '1px solid #eee'
    }}>
      {/* 3カラム：左=44pxアイコン / 中央=タイトル / 右=PCメニュー */}
      <div className="container" style={{
        display: 'grid', gridTemplateColumns: '44px 1fr auto', alignItems: 'center', gap: 8, height: 56
      }}>
        {/* 左：ユーザーアイコン（設定へ） */}
        <a href="/settings/backup" aria-label="アカウント/設定" title="設定">
          <div style={{
            width: 36, height: 36, borderRadius: '50%', background: '#e5e7eb',
            display: 'grid', placeItems: 'center', color: '#6b7280', border: '1px solid #d1d5db'
          }}>👤</div>
        </a>

        {/* 中央：タイトル（中央寄せ） */}
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          箱目録
        </div>

        {/* 右：PCのみメニュー（モバイルは非表示） */}
        <nav className="only-desktop" aria-label="トップメニュー">
          <div style={{ display: 'flex', gap: 8 }}>
            <LinkBtn href="/" label="ホーム" />
            <LinkBtn href="/register" label="登録" />
            <LinkBtn href="/boxes" label="箱リスト" />
            <LinkBtn href="/items" label="アイテムリスト" />
            <LinkBtn href="/help" label="ヘルプ" />
            <LinkBtn href="/settings/backup" label="設定" />
          </div>
        </nav>
      </div>
    </header>
  );
}
