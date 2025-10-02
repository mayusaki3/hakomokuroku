'use client';
import { useRef, useState } from 'react';
import type { SearchRow } from '@/lib/search';
import { searchByText, searchByQrPayload } from '@/lib/search';

let BrowserQRCodeReader: any; // dynamic import for QR
function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3l1.5 2H15l2 2h2a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2h2l2-4z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

export default function Home() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<any>(null);

  const runTextSearch = async () => {
    const res = await searchByText(q);
    setRows(res);
  };

  const startScan = async () => {
    setScanning(true);
    try {
      if (!BrowserQRCodeReader) {
        const mod = await import('@zxing/browser');
        BrowserQRCodeReader = mod.BrowserQRCodeReader;
      }
      if (!readerRef.current) readerRef.current = new BrowserQRCodeReader();

      const videoEl = videoRef.current!;
      videoEl.setAttribute('playsinline', 'true'); // iOS対策
      const result = await readerRef.current.decodeOnceFromVideoDevice(undefined, videoEl); // Resultを返す
      const text = result.getText();

      const res = await searchByQrPayload(text);
      setRows(res);
    } catch (e) {
      alert('QRの読み取りに失敗しました。もう一度お試しください。');
    } finally {
      setScanning(false);
      try { await readerRef.current?.reset(); } catch {}
    }
  };

  const onRowClick = (r: SearchRow) => {
    if (r.kind === 'box') {
      window.location.href = `/boxes/${r.box.id}`;
    } else if (r.kind === 'item') {
      window.location.href = `/items/${r.item.id}`;
    } else {
      const params = new URLSearchParams({ code: r.code });
      window.location.href = `/boxes/new?${params.toString()}`;
    }
  };

  return (
    <main className="container bottom-safe" style={{ display: 'grid', gap: 12, paddingTop: 8 }}>
      {/* 検索枠（説明文もこの中に移動） */}
      <section className="card search-card">
        <div className="searchbar">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runTextSearch(); }}
            placeholder="コード／箱名／場所／タグ／アイテム名／メモで検索"
            enterKeyHint="search"
            style={{ padding: 12, fontSize: 16 }}
          />
          <button type="button" onClick={runTextSearch} className="btn">検索</button>
          <button type="button" onClick={startScan} aria-disabled={scanning} className="icon-btn">
            <CameraIcon />
          </button>
        </div>

        {/* 説明文：モバイルでも必ず見えるよう検索枠の内側に配置 */}
        {rows.length === 0 && !scanning && (
          <p className="search-help">
            検索結果はここに表示されます。<br />
            <b>カメラ</b>をタップして<strong>箱のQR</strong>を読み取ると、該当の箱と中のアイテムが一覧表示されます。<br />
            未登録のコードなら「未登録」として表示され、タップで箱の登録に進めます。
          </p>
        )}

        {/* スキャナ表示（読み取り中のみ） */}
        {scanning && (
          <div style={{ marginTop: 8 }}>
            <video ref={videoRef} playsInline style={{ width: '100%', borderRadius: 8, border: '1px solid #eee' }} />
          </div>
        )}
      </section>

      {/* 検索結果（ホーム内で一覧表示） */}
      <section aria-label="検索結果">
        {rows.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {rows.map((r, idx) => {
              if (r.kind === 'box') {
                return (
                  <li key={`b-${r.box.id}-${idx}`}>
                    <button onClick={() => onRowClick(r)} className="card"
                      style={{ width: '100%', textAlign: 'left', padding: 12, cursor: 'pointer' }}>
                      <div style={{ fontWeight: 600 }}>📦 {r.box.name}</div>
                      <div style={{ fontSize: 12, color: '#555' }}>
                        コード: <code>{r.box.code}</code>　場所: {r.box.location ?? '—'}
                        {r.box.tags?.length ? <>　タグ: {r.box.tags.join(', ')}</> : null}
                      </div>
                    </button>
                  </li>
                );
              }
              if (r.kind === 'item') {
                return (
                  <li key={`i-${r.item.id}-${idx}`}>
                    <button onClick={() => onRowClick(r)} className="card"
                      style={{ width: '100%', textAlign: 'left', padding: 12, cursor: 'pointer' }}>
                      <div style={{ fontWeight: 600 }}>🧰 {r.item.name}</div>
                      <div style={{ fontSize: 12, color: '#555' }}>
                        箱: {r.box ? <>{r.box.name} <code>{r.box.code}</code></> : '—'}
                        {r.item.tags?.length ? <>　タグ: {r.item.tags.join(', ')}</> : null}
                      </div>
                    </button>
                  </li>
                );
              }
              // 未登録コード
              return (
                <li key={`u-${r.code}-${idx}`}>
                  <button onClick={() => onRowClick(r)} className="card"
                    style={{ width: '100%', textAlign: 'left', padding: 12, cursor: 'pointer' }}>
                    <div style={{ fontWeight: 600 }}>📦 箱コード: <code>{r.code}</code></div>
                    <div style={{ fontSize: 12, color: '#b91c1c' }}>未登録（タップで箱の登録へ）</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
