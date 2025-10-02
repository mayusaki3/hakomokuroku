'use client';
import { useState } from 'react';

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3l1.5 2H15l2 2h2a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2h2l2-4z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

export default function Home() {
  const [q, setQ] = useState('');
  const goSearch = () => {
    const s = q.trim();
    window.location.href = s ? `/search?q=${encodeURIComponent(s)}` : '/search';
  };

  return (
    <main className="container" style={{ display: 'grid', gap: 12, paddingTop: 8, paddingBottom: 72 }}>
      {/* 検索フィールドのみ */}
      <section className="card" style={{ padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') goSearch(); }}
            placeholder="検索（コード／箱名／場所／タグ／アイテム名／メモ）"
            enterKeyHint="search"
            style={{ flex: 1, padding: 12, fontSize: 16 }}
          />
          {/* 右にスキャン */}
          <button onClick={() => (window.location.href = '/scan')}
            aria-label="QRスキャン" title="QRスキャン"
            style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, background: '#fff' }}>
            <CameraIcon />
          </button>
          <button onClick={goSearch}
            style={{ padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, background: '#fff' }}>
            検索
          </button>
        </div>
      </section>

      {/* ここから下は検索結果用に空けておく（将来 /search をインライン表示にしてもOK） */}
      <section aria-label="検索結果" />
    </main>
  );
}
