'use client';
export default function Header() {
  const link = (href: string, label: string) => (
    <a href={href} style={{
      padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8,
      textDecoration: 'none', color: '#111827', background: '#fff'
    }}>{label}</a>
  );

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20,
      background: 'rgba(255,255,255,0.9)', backdropFilter: 'saturate(180%) blur(8px)',
      borderBottom: '1px solid #eee'
    }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <a href="/" style={{ fontWeight: 700, marginRight: 8, textDecoration: 'none', color: '#111827' }}>hakomokuroku</a>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {link('/boxes', '箱一覧')}
          {link('/boxes/new', '箱を作成')}
          {link('/scan', 'スキャン')}
          {link('/search', '検索')}
          {link('/settings/backup', 'バックアップ')}
        </div>
      </div>
    </header>
  );
}
