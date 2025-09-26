'use client';
import { useEffect, useState } from 'react';
import { getItem, listImagesByItem, removeItem } from '@/lib/db';
import { useParams, useRouter } from 'next/navigation';

type ImgRow = { url: string; w: number; h: number };

export default function ItemDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [boxId, setBoxId] = useState<string | null>(null);
  const [tags, setTags] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [imgs, setImgs] = useState<ImgRow[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const item = await getItem(params.id);
      if (!item) { router.replace('/boxes'); return; }
      setName(item.name);
      setBoxId(item.boxId);
      setTags((item.tags ?? []).join(', '));
      setNote(item.note ?? '');
      const rows: ImgRow[] = [];
      const list = await listImagesByItem(item.id);
      for (const im of list) {
        const blob = im.blob ?? im.thumbBlob;
        if (!blob) continue;
        rows.push({ url: URL.createObjectURL(blob), w: im.w, h: im.h });
      }
      if (alive) setImgs(rows);
    })();
    return () => {
      alive = false;
      imgs.forEach(r => URL.revokeObjectURL(r.url));
    };
  }, [params.id]);

  const onDelete = async () => {
    if (!confirm('このアイテムを削除しますか？写真も削除されます。')) return;
    await removeItem(params.id);
    if (boxId) router.push(`/boxes/${boxId}/items`); else router.push('/boxes');
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>アイテム詳細</h1>
      <div style={{ color: '#555', marginBottom: 12 }}>{boxId ? <a href={`/boxes/${boxId}/items`}>← 箱のアイテム一覧に戻る</a> : null}</div>
      <div style={{ display: 'grid', gap: 12, maxWidth: 800 }}>
        <div><b>名称：</b>{name}</div>
        <div><b>タグ：</b>{tags}</div>
        <div><b>メモ：</b><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{note}</pre></div>

        <h2>写真</h2>
        {imgs.length === 0 && <p>写真がありません。</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {imgs.map((r, i) => (
            <a key={i} href={r.url} target="_blank">
              <img src={r.url} style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} />
            </a>
          ))}
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button onClick={onDelete} style={{ padding: '6px 10px', color: '#b91c1c', border: '1px solid #fca5a5', background: '#fff' }}>
            削除
          </button>
        </div>
      </div>
    </main>
  );
}
