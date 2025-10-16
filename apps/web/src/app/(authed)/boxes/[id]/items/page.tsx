'use client';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db';
import { useParams } from 'next/navigation';
import { useDexieLive } from '@/lib/live';

type Row = {
  id: string;
  name: string;
  tagLine?: string;
  // UI用（objectURL）—計算で作る
  thumbUrl?: string;
  // 内部保持（URL破棄のため）
  _blob?: Blob;
};

export default function BoxItemsPage() {
  const { id: boxId } = useParams<{ id: string }>();
  const [q, setQ] = useState('');

  // items と images の両方に反応する liveQuery
  const { data: rowsRaw } = useDexieLive<Row[]>(
    async () => {
      const items = await db.items.where('boxId').equals(boxId).reverse().sortBy('updatedAt');
      const rows = await Promise.all(items.map(async it => {
        const img = await db.images.where('itemId').equals(it.id).reverse().sortBy('createdAt').then(xs => xs[0]);
        return {
          id: it.id,
          name: it.name,
          tagLine: (it.tags ?? []).join(', '),
          _blob: img?.thumbBlob ?? img?.blob, // あればサムネ、なければ原本
        } as Row;
      }));
      return rows;
    },
    [boxId],
    []
  );

  // objectURL を生成（変更時に古いURLは破棄）
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    // 既存URLをクリーンアップ
    rows.forEach(r => r.thumbUrl && URL.revokeObjectURL(r.thumbUrl));

    const withUrl = rowsRaw.map(r => ({
      ...r,
      thumbUrl: r._blob ? URL.createObjectURL(r._blob) : undefined,
    }));
    setRows(withUrl);

    return () => {
      withUrl.forEach(r => r.thumbUrl && URL.revokeObjectURL(r.thumbUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsRaw]);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return rows.filter(r => (r.name + ' ' + (r.tagLine ?? '')).toLowerCase().includes(needle));
  }, [rows, q]);

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
