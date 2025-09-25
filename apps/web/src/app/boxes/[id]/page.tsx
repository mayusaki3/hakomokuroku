'use client';
import { useEffect, useState } from 'react';
import { Box, getBox, removeBox, updateBox } from '@/lib/db';
import { useParams, useRouter } from 'next/navigation';

export default function BoxDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [box, setBox] = useState<Box | null>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const b = await getBox(params.id);
      if (alive) {
        setBox(b ?? null);
        setName(b?.name ?? '');
        setLocation(b?.location ?? '');
        setTags((b?.tags ?? []).join(', '));
      }
    })();
    return () => { alive = false; };
  }, [params.id]);

  if (!box) {
    return <main style={{ padding: 24 }}><p>読み込み中、または存在しません。</p></main>;
  }

  const onSave = async () => {
    await updateBox(box.id, {
      name: name.trim() || box.code,
      location: location.trim() || undefined,
      tags: tags.split(',').map(s => s.trim()).filter(Boolean),
    });
    alert('保存しました');
  };

  const onDelete = async () => {
    if (!confirm('この箱を削除しますか？中のアイテム・画像も削除されます。')) return;
    await removeBox(box.id);
    router.push('/boxes');
  };

  const tapeUrl = `/print/tape?${new URLSearchParams({
    code: box.code, name: name || box.name, location: location || '', n: '1', s: '14', m: '2'
  }).toString()}`;
  const a4Url = `/print/labels?${new URLSearchParams({
    code: box.code, name: name || box.name, location: location || '', n: '21', cols: '7', gap: '2', s: '14', m: '2', o: 'portrait'
  }).toString()}`;

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1>箱の詳細</h1>
      <p><code>{box.code}</code></p>

      <div style={{ display: 'grid', gap: 12 }}>
        <label>箱名
          <input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
        <label>場所 / 保管先
          <input value={location} onChange={e => setLocation(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
        <label>タグ（カンマ区切り）
          <input value={tags} onChange={e => setTags(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onSave} style={{ padding: '6px 10px' }}>保存</button>
          <a href={tapeUrl} target="_blank" style={{ padding: '6px 10px', border: '1px solid #ddd', textDecoration: 'none' }}>テープ印刷</a>
          <a href={a4Url}   target="_blank" style={{ padding: '6px 10px', border: '1px solid #ddd', textDecoration: 'none' }}>A4面付け</a>
          <button onClick={onDelete} style={{ padding: '6px 10px', color: '#b91c1c', border: '1px solid #fca5a5', background: '#fff' }}>
            削除
          </button>
          <a href="/boxes" style={{ padding: '6px 10px', border: '1px solid #ddd', textDecoration: 'none' }}>一覧に戻る</a>
        </div>
      </div>
    </main>
  );
}
