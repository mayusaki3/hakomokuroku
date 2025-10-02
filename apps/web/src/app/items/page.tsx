'use client';
import { useMemo, useState, useEffect } from 'react';
import { db, Item, Box } from '@/lib/db';
import { useDexieLive } from '@/lib/live';

export default function ItemsPage() {
  const [q, setQ] = useState('');
  const { data: items } = useDexieLive<Item[]>(async () => db.items.orderBy('updatedAt').reverse().toArray(), [], []);
  const { data: boxes } = useDexieLive<Box[]>(async () => db.boxes.toArray(), [], []);
  const boxMap = useMemo(() => new Map(boxes.map(b => [b.id, b])), [boxes]);

  const rows = useMemo(() => {
    const needle = q.toLowerCase();
    return items
      .filter(it => (it.name + ' ' + (it.tags ?? []).join(' ') + ' ' + (it.note ?? '')).toLowerCase().includes(needle))
      .map(it => ({ it, box: boxMap.get(it.boxId) }));
  }, [items, boxMap, q]);

  return (
    <main className="container" style={{ display: 'grid', gap: 12 }}>
      <h1>アイテム一覧</h1>
      <div className="row">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="検索" style={{ flex: 1, padding: 10 }} />
      </div>

      <div className="grid-cards">
        {rows.map(({ it, box }) => (
          <a key={it.id} href={`/items/${it.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <article className="card" style={{ padding: 12 }}>
              <div style={{ fontWeight: 600 }}>{it.name}</div>
              <div style={{ color: '#555', fontSize: 12, marginTop: 4 }}>
                箱: {box ? <>{box.name} <code>{box.code}</code></> : '—'}
              </div>
              {it.tags?.length ? <div style={{ marginTop: 4, fontSize: 12 }}>{it.tags.join(', ')}</div> : null}
            </article>
          </a>
        ))}
      </div>
    </main>
  );
}
