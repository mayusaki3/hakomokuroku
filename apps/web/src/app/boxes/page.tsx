'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, Box } from '@/lib/db';
import { useDexieLive } from '@/lib/live';
import { useHeaderTitle } from '@/app/components/HeaderTitleContext';
import { useRouter, useSearchParams } from 'next/navigation';

let BrowserQRCodeReader: any;

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3l1.5 2H15l2 2h2a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2h2l2-4z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
function ClearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

type Unreg = { kind:'unregistered'; code: string };

export default function BoxesPage() {
  useHeaderTitle('箱リスト');

  const router = useRouter();
  const sp = useSearchParams();

  // 初期値をURLから復元
  const [q, setQ] = useState(() => sp.get('q') ?? '');
  const [qrCode, setQrCode] = useState<string | null>(() => sp.get('qr') ?? null);
  const [unreg, setUnreg] = useState<Unreg | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<any>(null);

  // Dexie live
  const { data: boxes = [] } = useDexieLive<Box[]>(
    async () => db.boxes.orderBy('updatedAt').reverse().toArray(),
    [],
    [],
  );

  // クエリ→URLへ即時反映（replaceで履歴を汚さない）
  useEffect(() => {
    const params = new URLSearchParams(sp.toString());
    if (q) params.set('q', q); else params.delete('q');
    if (qrCode) params.set('qr', qrCode); else params.delete('qr');
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, qrCode]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let byText = !needle ? boxes : boxes.filter(b => {
      const s = `${b.code} ${b.name} ${b.location ?? ''} ${(b.tags ?? []).join(' ')}`.toLowerCase();
      return s.includes(needle);
    });
    if (qrCode) {
      byText = byText.filter(b => b.code.toLowerCase() === qrCode.toLowerCase());
    }
    return byText;
  }, [boxes, q, qrCode]);

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
      const code = m ? decodeURIComponent(m[1])
        : (/^[A-Za-z0-9._-]{2,64}$/.test(text) ? text : null);

      if (!code) {
        alert('このQRから箱コードを抽出できませんでした。');
        setQrCode(null); setUnreg(null);
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

  const clearAll = () => { setQ(''); setQrCode(null); setUnreg(null); };

  const onRowClick = (b: Box) => { window.location.href = `/boxes/${b.id}`; };
  const onUnregClick = (code: string) => {
    const params = new URLSearchParams({ code });
    window.location.href = `/boxes/new?${params.toString()}`;
  };

  return (
    <main className="container bottom-safe" style={{ display: 'grid', gap: 12, paddingTop: 8 }}>
      {/* 絞り込み（ボタン無し／クリア＋カメラ） */}
      <section className="card search-card">
        <div className="searchbar">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="絞り込み（コード／箱名／場所／タグ）"
            enterKeyHint="search"
            style={{ padding: 12, fontSize: 16 }}
          />
          <button type="button" className="clear-btn" onClick={clearAll} disabled={!q && !qrCode} title="絞り込みをクリア">
            <ClearIcon />
          </button>
          <button type="button" className="icon-btn" onClick={startScan} aria-disabled={scanning} title="箱コードで絞り込み">
            <CameraIcon />
          </button>
        </div>

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

      {/* 箱リスト */}
      <section aria-label="箱リスト">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {rows.map(b => (
            <li key={b.id}>
              <button onClick={() => onRowClick(b)} className="card"
                style={{ width: '100%', textAlign: 'left', padding: 12, cursor: 'pointer' }}>
                <div style={{ fontWeight: 600 }}>📦 {b.name}</div>
                <div style={{ fontSize: 12, color: '#555' }}>
                  コード: <code>{b.code}</code>　場所: {b.location ?? '—'}
                  {b.tags?.length ? <>　タグ: {b.tags.join(', ')}</> : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
