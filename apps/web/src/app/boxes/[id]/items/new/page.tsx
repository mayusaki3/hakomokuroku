'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createItem, addImagesToItem } from '@/lib/db';
import { downscaleToWebp, makeThumbWebp } from '@/lib/image';

type Preview = { url: string; sizeKB: number };

export default function NewItemPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const boxId = params.id;

  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    // iOSなどでPWA保存領域を確保しやすくする
    (async () => {
      if (navigator.storage?.persist) { try { await navigator.storage.persist(); } catch {} }
    })();
  }, []);

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const arr = Array.from(list);
    setFiles(prev => [...prev, ...arr]);

    // 画面プレビュー（縮小済みのサイズの目安を先に見せるため、生ファイルサイズを表示）
    const pv = arr.map(f => ({ url: URL.createObjectURL(f), sizeKB: Math.round(f.size / 1024) }));
    setPreviews(prev => [...prev, ...pv]);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { alert('アイテム名を入力してください'); return; }
    setBusy(true);
    try {
      const itemId = await createItem(boxId, {
        name: name.trim(),
        quantity: undefined,
        tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        features: undefined,
        note: note.trim() || undefined,
        imageIds: [],
      });

      // 画像の縮小＆サムネ生成 → IndexedDB 保存
      const payload = [];
      for (const f of files) {
        const full = await downscaleToWebp(f, 1600, 0.85);
        const thumb = await makeThumbWebp(f, 400, 0.8);
        payload.push({ blob: full.blob, thumbBlob: thumb.blob, w: full.w, h: full.h });
      }
      if (payload.length) {
        await addImagesToItem({ boxId, itemId, images: payload });
      }

      router.push(`/boxes/${boxId}/items`);
    } catch (err: any) {
      alert(err?.message ?? '保存に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 760 }}>
      <h1>アイテムの追加</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>アイテム名
          <input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
        <label>タグ（カンマ区切り）
          <input value={tags} onChange={e => setTags(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
        <label>メモ
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} style={{ width: '100%', padding: 8 }} />
        </label>

        <div>
          <div style={{ marginBottom: 6 }}>写真（複数可：スマホならカメラ起動）</div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={e => onFiles(e.target.files)}
          />
          {previews.length > 0 && (
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
              {previews.map((p, i) => (
                <figure key={i} style={{ margin: 0, border: '1px solid #eee', borderRadius: 6, overflow: 'hidden' }}>
                  <img src={p.url} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                  <figcaption style={{ fontSize: 12, padding: '2px 6px', color: '#555' }}>{p.sizeKB} KB</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={busy} style={{ padding: '8px 12px' }}>{busy ? '保存中…' : '保存'}</button>
          <a href={`/boxes/${boxId}/items`} style={{ padding: '8px 12px', border: '1px solid #ddd', textDecoration: 'none' }}>一覧へ</a>
        </div>
      </form>
    </main>
  );
}
