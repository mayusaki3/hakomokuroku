'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getBoxByCode } from '@/lib/db';

export default function ResolveByCodePage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code).toUpperCase();
  const [state, setState] = useState<'loading'|'found'|'missing'>('loading');
  const [boxId, setBoxId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const box = await getBoxByCode(code);
      if (!alive) return;
      if (box) { setBoxId(box.id); setState('found'); }
      else { setState('missing'); }
    })();
    return () => { alive = false; };
  }, [code]);

  if (state === 'loading') return <main style={{ padding: 24 }}><p>読み込み中…</p></main>;

  if (state === 'found') {
    return (
      <main style={{ padding: 24 }}>
        <h1>箱コード: <code>{code}</code></h1>
        <p>この端末に登録済みの箱が見つかりました。</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={`/boxes/${boxId}`} style={{ padding: '8px 12px', border: '1px solid #ddd', textDecoration: 'none' }}>箱の詳細へ</a>
          <a href={`/boxes/${boxId}/items`} style={{ padding: '8px 12px', border: '1px solid #ddd', textDecoration: 'none' }}>アイテム一覧へ</a>
        </div>
      </main>
    );
  }

  // missing
  const urlNew = `/boxes/new?code=${encodeURIComponent(code)}`;
  return (
    <main style={{ padding: 24 }}>
      <h1>箱コード: <code>{code}</code></h1>
      <p>この端末には登録がありません。新規に作成しますか？</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <a href={urlNew} style={{ padding: '8px 12px', border: '1px solid #ddd', textDecoration: 'none' }}>このコードで箱を作成</a>
        <a href="/boxes" style={{ padding: '8px 12px', border: '1px solid #ddd', textDecoration: 'none' }}>箱一覧へ</a>
      </div>
    </main>
  );
}
