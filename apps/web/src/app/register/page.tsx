export default function RegisterHub() {
  return (
    <main className="container" style={{ display: 'grid', gap: 12, paddingTop: 8, paddingBottom: 72 }}>
      <h1>登録</h1>
      <div className="grid-cards">
        <a href="/boxes/new" className="card" style={{ textDecoration: 'none', color: 'inherit', padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>箱を登録</h2>
          <p style={{ margin: 0, color: '#555' }}>箱コードと名称を設定</p>
        </a>
        <a href="/boxes" className="card" style={{ textDecoration: 'none', color: 'inherit', padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>アイテムを登録</h2>
          <p style={{ margin: 0, color: '#555' }}>箱詳細→アイテム追加から撮影・登録</p>
        </a>
      </div>
    </main>
  );
}
