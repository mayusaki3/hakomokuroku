'use client';
function Icon({name}:{name:'home'|'add'|'boxes'|'items'|'help'|'settings'}) {
  const map = {
    home:'🏠', add:'➕', boxes:'📦', items:'🧰', help:'❓', settings:'⚙️'
  } as const;
  return <span aria-hidden>{map[name]}</span>;
}
export default function MobileTabBar() {
  const Item = ({href, name, label}:{href:string; name:Parameters<typeof Icon>[0]['name']; label:string}) => (
    <a href={href} style={{ textDecoration: 'none', color: '#111827', textAlign: 'center', flex: 1 }}>
      <div><Icon name={name} /></div>
      <div style={{ fontSize: 12 }}>{label}</div>
    </a>
  );
  return (
    <nav className="only-mobile" aria-label="下部ナビ"
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 45, background: '#fff', borderTop: '1px solid #eee' }}>
      <div className="container" style={{ padding: 6 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Item href="/" label="ホーム" name="home" />
          <Item href="/register" label="登録" name="add" />
          <Item href="/boxes" label="箱リスト" name="boxes" />
          <Item href="/items" label="アイテム" name="items" />
          <Item href="/help" label="ヘルプ" name="help" />
          <Item href="/settings/backup" label="設定" name="settings" />
        </div>
      </div>
    </nav>
  );
}
