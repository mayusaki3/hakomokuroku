'use client';
import { useEffect, useState } from 'react';
import { listItemsByBox, listImagesByItem } from '@/lib/db';
import { useParams } from 'next/navigation';

type Row = {
  id: string;
  name: string;
  thumbUrl?: string;
  tagLine?: string;
};

export default function BoxItemsPage() {
  const params = useParams<{ id: string }>();
  const boxId = params.id;
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const items = await listItemsByBox(boxId);
      const rows: Row[] = [];
      for (const it of items) {
        let thumbUrl: string | undefined;
        const imgs = await listImagesByItem(it.id);
        if (imgs[0]?.thumbBlob) {
          thumbUrl = URL.createObjectURL(imgs[0].thumbBlob);
        }
        rows.push({ id: it.id, name: it.name, thumbUrl, tagLine: (it.tags ?? []).join(', ') });
      }
      if (alive) setRows(rows);
    })();
    return () => {
      alive = false;
      // objectURL の開放
      rows.forEach(r => r.thumbUrl && URL.revokeObjectURL(r.thumbUrl));
    };
  }, [boxId]);

  const filtered = rows.filter(r => (r.name + ' ' + (r.tagLine ?? '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <main style={{ padding: 24 }}>
      <h1>アイテム一覧</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input placeholder="検索" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, padding: 8 }} />
        <a href={`/boxes/${boxId}/items/new`} style={{ padding: '8px 12px', border: '1px solid #ddd', textDecoration: 'none' }}>追加</a>
        <a href={`/boxes/${boxId}`} style={{ padding: '8px 12px', border: '1px solid #ddd', textDecoration: 'none' }}>箱詳細</a>
      </div>

      {filtered.length === 0 && <p>アイテムがありません。まずは「追加」から。</p>}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {filtered.map(r => (
          <a key={r.id} href={`/items/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <article style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
              {r.thumbUrl
                ? <img src={r.thumbUrl} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                : <div style={{ height: 140, background: '#f3f4f6', display: 'grid', placeItems: 'center', color: '#9ca3af' }}>No Image</div>}
              <div style={{ padding: 8 }}>
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: '#555' }}>{r.tagLine}</div>
              </div>
            </article>
          </a>
        ))}
      </div>
    </main>
  );
}
