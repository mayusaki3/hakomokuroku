'use client';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db';
import { useParams, useRouter } from 'next/navigation';
import { useDexieLive } from '@/lib/live';
import { downscaleToWebp, makeThumbWebp } from '@/lib/image';
import { findBoxByCodeOrId, moveItem } from '@/lib/db';

type ImgRow = { id: string; url?: string; blob?: Blob; w: number; h: number };

export default function ItemDetailPage() {
  const { id: itemId } = useParams<{ id: string }>();
  const router = useRouter();

  // アイテム本体
  const [name, setName] = useState('');
  const [boxId, setBoxId] = useState<string | null>(null);
  const [tags, setTags] = useState<string>('');
  const [note, setNote] = useState<string>('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const item = await db.items.get(itemId);
      if (!item) { router.replace('/boxes'); return; }
      if (!alive) return;
      setName(item.name);
      setBoxId(item.boxId);
      setTags((item.tags ?? []).join(', '));
      setNote(item.note ?? '');
    })();
    return () => { alive = false; };
  }, [itemId, router]);

  // 画像（live）— 並び順に追従
  const { data: imgsLive } = useDexieLive(async () => {
    return await listImagesByItemOrdered(itemId);
  }, [itemId], []);

  // 表示用：objectURL を生成し管理
  const [rows, setRows] = useState<ImgRow[]>([]);
  useEffect(() => {
    // 既存URLクリーンアップ
    rows.forEach(r => r.url && URL.revokeObjectURL(r.url));

    const withUrl = imgsLive.map(im => {
      const blob = im.thumbBlob ?? im.blob;
      return {
        id: im.id,
        blob,
        url: blob ? URL.createObjectURL(blob) : undefined,
        w: im.w, h: im.h,
      };
    });
    setRows(withUrl);

    return () => withUrl.forEach(r => r.url && URL.revokeObjectURL(r.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgsLive]);

  // 追加
  const [busyAdd, setBusyAdd] = useState(false);
  const onAddFiles = async (files: FileList | null) => {
    if (!files?.length || !boxId) return;
    setBusyAdd(true);
    try {
      const payload = [];
      for (const f of Array.from(files)) {
        const full = await downscaleToWebp(f, 1600, 0.85);
        const thumb = await makeThumbWebp(f, 400, 0.8);
        payload.push({ blob: full.blob, thumbBlob: thumb.blob, w: full.w, h: full.h, exif: { orientation: full.orientation ?? thumb.orientation } });
      }
      if (payload.length) await addImagesToItem({ boxId, itemId, images: payload });
    } catch (e: any) {
      alert(e?.message ?? '画像の追加に失敗しました');
    } finally {
      setBusyAdd(false);
    }
  };

  // 削除
  const onDeleteImage = async (id: string) => {
    if (!confirm('この写真を削除しますか？')) return;
    await removeImage(id);
  };

  // 並べ替え（↑↓）
  const commitOrder = async (next: ImgRow[]) => {
    await setImageOrder(itemId, next.map(r => r.id));
  };
  const move = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    const tmp = next[idx]; next[idx] = next[j]; next[j] = tmp;
    setRows(next);
    await commitOrder(next);
  };

  // アイテム削除
  const onDeleteItem = async () => {
    if (!confirm('このアイテムを削除しますか？写真も削除されます。')) return;
    await removeItem(itemId);
    if (boxId) router.push(`/boxes/${boxId}/items`); else router.push('/boxes');
  };

  const count = rows.length;

  return (
    <main style={{ padding: 24 }}>
      <h1>アイテム詳細</h1>
      <div style={{ color: '#555', marginBottom: 12 }}>{boxId ? <a href={`/boxes/${boxId}/items`}>← 箱のアイテム一覧に戻る</a> : null}</div>

      <section style={{ display: 'grid', gap: 8, maxWidth: 800, marginBottom: 16 }}>
        <div><b>名称：</b>{name}</div>
        <div><b>タグ：</b>{tags}</div>
        <div><b>メモ：</b><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{note}</pre></div>
      </section>

      <section style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>写真（{count}）</h2>
        <div style={{ marginBottom: 8 }}>
          <input type="file" accept="image/*" multiple capture="environment" onChange={e => onAddFiles(e.target.files)} />
          {busyAdd && <span style={{ marginLeft: 8 }}>追加中…</span>}
        </div>

        {count === 0 && <p>写真がありません。</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {rows.map((r, i) => (
            <figure key={r.id} style={{ margin: 0, border: '1px solid #eee', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
              {r.url
                ? <a href={r.url} target="_blank"><img src={r.url} style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} /></a>
                : <div style={{ height: 200, background: '#f3f4f6' }} />}
              <figcaption style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#555' }}>{r.w}×{r.h}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => move(i, -1)} disabled={i === 0} title="上へ">↑</button>
                  <button onClick={() => move(i, +1)} disabled={i === rows.length - 1} title="下へ">↓</button>
                  <button onClick={() => onDeleteImage(r.id)} style={{ color: '#b91c1c' }}>削除</button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', gap: 8 }}>
        <MoveItemButton itemId={itemId} />
        <button onClick={onDeleteItem} style={{ padding: '6px 10px', color: '#b91c1c', border: '1px solid #fca5a5', background: '#fff' }}>
          アイテム削除
        </button>
        {boxId && <a href={`/boxes/${boxId}/items`} style={{ padding: '6px 10px', border: '1px solid #ddd', textDecoration: 'none' }}>一覧に戻る</a>}
      </div>
    </main>
  );
}

function MoveItemButton({ itemId }: { itemId: string }) {
  const router = useRouter();

  const onMove = async () => {
    const key = prompt('移動先の「箱ID」または「箱コード」を入力してください（例: UNASSIGNED または B-...）');
    if (!key) return;
    const target = await findBoxByCodeOrId(key);
    if (!target) {
      alert('該当する箱が見つかりません');
      return;
    }
    await moveItem(itemId, target.id);
    alert(`「${target.name ?? target.code}」へ移動しました`);
    // 好みで遷移先を変更: 移動先の箱詳細へ
    router.push(`/boxes/${target.id}`);
  };

  return (
    <button className="btn" onClick={onMove}>
      アイテムを別の箱へ移動
    </button>
  );
}
