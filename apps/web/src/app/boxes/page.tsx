'use client';
import { useMemo, useState } from 'react';
import { Box, db } from '@/lib/db';
import { useDexieLive } from '@/lib/live';

export default function BoxesPage() {
  const [q, setQ] = useState('');

  // updatedAt 降順で常に最新を取得
  const { data: boxes } = useDexieLive<Box[]>(
    async () => db.boxes.orderBy('updatedAt').reverse().toArray(),
    [], // 依存はなし（クエリ自体がテーブル更新で再実行される）
    []
  );

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return boxes.filter(b => {
      const hay = [b.code, b.name, b.location ?? '', ...(b.tags ?? [])].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [boxes, q]);

  return (
    <main style={{ padding: 24 }}>
      <h1>箱 一覧</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          placeholder="検索（コード/名前/場所/タグ）"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 240, padding: 8 }}
        />
        <a href="/boxes/new" style={{ padding: '8px 12px', border: '1px solid #ddd', textDecoration: 'none' }}>新規作成</a>
        <a href="/scan" style={{ padding: '8px 12px', border: '1px solid #ddd', textDecoration: 'none' }}>スキャン</a>
        <a href="/settings/backup" style={{ padding: '8px 12px', border: '1px solid #ddd', textDecoration: 'none' }}>バックアップ/復元</a>
      </div>

      {filtered.length === 0 && <p>データがありません。まずは「新規作成」から。</p>}

      <div style={{ display: 'grid', gap: 12 }}>
        {filtered.map(b => (
          <article key={b.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
              <h3 style={{ margin: 0 }}>{b.name}</h3>
              <code>{b.code}</code>
            </div>
            <div style={{ color: '#555', marginTop: 4 }}>
              {b.location ?? '場所未設定'} {b.tags?.length ? '｜ ' + b.tags.join(', ') : ''}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href={`/boxes/${b.id}`} style={{ padding: '6px 10px', border: '1px solid #ddd', textDecoration: 'none' }}>詳細</a>
              <a
                href={`/print/tape?${new URLSearchParams({
                  code: b.code, name: b.name, location: b.location ?? '', n: '1', s: '14', m: '2'
                }).toString()}`}
                target="_blank"
                style={{ padding: '6px 10px', border: '1px solid #ddd', textDecoration: 'none' }}
              >テープ印刷</a>
              <a
                href={`/print/labels?${new URLSearchParams({
                  code: b.code, name: b.name, location: b.location ?? '', n: '21', cols: '7', gap: '2', s: '14', m: '2', o: 'portrait'
                }).toString()}`}
                target="_blank"
                style={{ padding: '6px 10px', border: '1px solid #ddd', textDecoration: 'none' }}
              >A4面付け</a>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
