'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, Box } from '@/lib/db';
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

export default function BoxesPage() {
  useHeaderTitle('箱リスト');

  const [q, setQ] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [unreg, setUnreg] = useState<Unreg | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<any>(null);

  const { data: boxes = [] } = useDexieLive<Box[]>(
    async () => db.boxes.orderBy('updatedAt').reverse().toArray(),
    [],
    [],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const byText = !needle ? boxes : boxes.filter(b => {
      const s = `${b.code} ${b.name} ${b.location ?? ''} ${(b.tags ?? []).join(' ')}`.toLowerCase();
      return s.includes(needle);
    });

    // QR優先（箱コード完全一致で絞り込み）
    if (qrCode) {
      const hit = byText.filter(b => b.code.toLowerCase() === qrCode.toLowerCase());
      return hit;
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

      // 箱コード（/b/<code> or プレーンコード）
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

  const onRowClick = (b: Box) => { window.location.href = `/boxes/${b.id}`; };
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
            onKeyDown={e => { if (e.key === 'Enter') {/* Enterで絞り込み済み */} }}
            placeholder="絞り込み（コード／箱名／場所／タグ）"
            enterKeyHint="search"
            style={{ padding: 12, fontSize: 16 }}
          />
          <button type="button" className="btn" onClick={() => {/* 入力で既に反映。視認性のため残す */}}>絞り込み</button>
          <button type="button" className="icon-btn" onClick={startScan} aria-disabled={scanning} title="箱コードで絞り込み">
            <CameraIcon />
          </button>
        </div>

        {/* ガイダンス（該当0件時に表示） */}
        {rows.length === 0 && !unreg && !scanning && (
          <p className="search-help">
            条件に一致する箱がありません。<br />
            カメラで<strong>箱のQR</strong>を読み取ると、<strong>箱コード</strong>で絞り込みます。
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
