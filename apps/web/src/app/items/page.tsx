'use client';
import { useMemo, useRef, useState } from 'react';
import { db, Item, Box } from '@/lib/db';
import { useDexieLive } from '@/lib/live';
import { useHeaderTitle } from '@/app/components/HeaderTitleContext';

let BrowserQRCodeReader: any;

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3l1.5 2H15l2 2h2a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2h2l2-4z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

type Unreg = { kind:'unregistered'; code: string };

export default function ItemsPage() {
  useHeaderTitle('アイテムリスト');

  const [q, setQ] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [unreg, setUnreg] = useState<Unreg | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<any>(null);

  const { data: items = [] } = useDexieLive<Item[]>(
    async () => db.items.orderBy('updatedAt').reverse().toArray(),
    [],
    [],
  );
  const { data: boxes = [] } = useDexieLive<Box[]>(
    async () => db.boxes.toArray(),
    [],
    [],
  );
  const boxMap = useMemo(() => new Map(boxes.map(b => [b.id, b])), [boxes]);

  const rows = useMemo(() => {
    const text = q.trim().toLowerCase();

    let base = items;
    if (text) {
      base = base.filter(it => {
        const box = boxMap.get(it.boxId);
        const hay = `${it.name} ${(it.tags ?? []).join(' ')} ${it.note ?? ''} ${box?.name ?? ''} ${box?.code ?? ''}`.toLowerCase();
        return hay.includes(text);
      });
    }

    // QR（箱コード）優先：該当箱のアイテムのみに絞る
    if (qrCode) {
      const hitBox = boxes.find(b => b.code.toLowerCase() === qrCode.toLowerCase());
      if (hitBox) {
        base = base.filter(it => it.boxId === hitBox.id);
      } else {
        base = []; // 該当箱なし
      }
    }

    return base.map(it => ({ it, box: boxMap.get(it.boxId) }));
  }, [items, boxes, boxMap, q, qrCode]);

  const startScan = async () => {
    setScanning(true);
    try {
      if (!BrowserQRCodeReader) {
        const mod = await import('@zxing/browser');
        BrowserQRCodeReader = mod.BrowserQRCodeReader;
      }
      if (!readerRef.current) readerRef.current = new BrowserQRCodeReader();

      const videoEl = videoRef.current!;
      videoEl.setAttribute('playsinline', 'true');
      const result = await readerRef.current.decodeOnceFromVideoDevice(undefined, videoEl);
      const text = result.getText().trim();

      const m = text.match(/(?:^|\/)b\/([^/]+)/);
      const code = m ? decodeURIComponent(m[1]) :
        (/^[A-Za-z0-9._-]{2,64}$/.test(text) ? text : null);

      if (!code) {
        alert('このQRから箱コードを抽出できませんでした。');
        setQrCode(null);
        setUnreg(null);
      } else {
        setQrCode(code);
        const hit = await db.boxes.where('code').equalsIgnoreCase(code).first();
        setUnreg(hit ? null : { kind: 'unregistered', code });
      }
    } catch {
      alert('QRの読み取りに失敗しました。もう一度お試しください。');
    } finally {
      setScanning(false);
      try { await readerRef.current?.reset(); } catch {}
    }
  };

  const onItemClick = (id: string) => { window.location.href = `/items/${id}`; };
  const onUnregClick = (code: string) => {
    const params = new URLSearchParams({ code });
    window.location.href = `/boxes/new?${params.toString()}`;
  };

  return (
    <main className="container bottom-safe" style={{ display: 'grid', gap: 12, paddingTop: 8 }}>
      {/* 絞り込み（トップ準拠） */}
      <section className="card search-card">
        <div className="searchbar">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') {/* 入力で反映 */} }}
            placeholder="絞り込み（アイテム名／タグ／メモ／箱名／箱コード）"
            enterKeyHint="search"
            style={{ padding: 12, fontSize: 16 }}
          />
          <button type="button" className="btn">絞り込み</button>
          <button type="button" className="icon-btn" onClick={startScan} aria-disabled={scanning} title="箱コードで絞り込み">
            <CameraIcon />
          </button>
        </div>

        {/* ガイダンス（該当0件時） */}
        {rows.length === 0 && !unreg && !scanning && (
          <p className="search-help">
            条件に一致するアイテムがありません。<br />
            カメラで<strong>箱のQR</strong>を読み取ると、その<strong>箱のアイテム</strong>だけに絞り込みます。
          </p>
        )}

        {/* スキャン中プレビュー */}
        {scanning && (
          <div style={{ marginTop: 8 }}>
            <video ref={videoRef} playsInline style={{ width: '100%', borderRadius: 8, border: '1px solid #eee' }} />
          </div>
        )}

        {/* 未登録コード行（QRで未ヒット時） */}
        {unreg && (
          <div className="card" style={{ marginTop: 8, padding: 12 }}>
            <div style={{ fontWeight: 600 }}>📦 箱コード: <code>{unreg.code}</code></div>
            <div style={{ fontSize: 12, color: '#b91c1c' }}>未登録（タップで箱の登録へ）</div>
            <button className="btn" style={{ marginTop: 8 }} onClick={() => onUnregClick(unreg.code)}>登録に進む</button>
          </div>
        )}
      </section>

      {/* アイテムリスト */}
      <section aria-label="アイテムリスト">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {rows.map(({ it, box }) => (
            <li key={it.id}>
              <button onClick={() => onItemClick(it.id)} className="card"
                style={{ width: '100%', textAlign: 'left', padding: 12, cursor: 'pointer' }}>
                <div style={{ fontWeight: 600 }}>🧰 {it.name}</div>
                <div style={{ fontSize: 12, color: '#555' }}>
                  箱: {box ? <>{box.name} <code>{box.code}</code></> : '—'}
                  {it.tags?.length ? <>　タグ: {it.tags.join(', ')}</> : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
