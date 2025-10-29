'use client';
import { useRef, useState } from 'react';
import type { SearchRow } from '@/lib/search';
import { searchByText, searchByQrPayload } from '@/lib/search';
import ListRow from '@/app/components/ListRow';

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
    const q0 = q.trim();
    try {
      let res = await searchByText(q0 === '' ? '*' : q0);
      if ((res?.length ?? 0) === 0 && q0 === '') {
        const { db } = await import('@/lib/db');
        const [boxes, items] = await Promise.all([
          db.boxes.orderBy('updatedAt').reverse().limit(200).toArray(),
          db.items.orderBy('updatedAt').reverse().limit(200).toArray(),
        ]);
        const boxMap = new Map<string, any>(boxes.map((b: any) => [b.id, b]));
        res = [
          ...boxes.map((b: any) => ({ kind: 'box', box: b } as SearchRow)),
          ...items.map((it: any) => ({ kind: 'item', item: it, box: boxMap.get(it.boxId) } as SearchRow)),
        ];
      }
      setRows(res);
    } catch {
      if (q0 === '') {
        try {
          const { db } = await import('@/lib/db');
          const [boxes, items] = await Promise.all([
            db.boxes.orderBy('updatedAt').reverse().limit(200).toArray(),
            db.items.orderBy('updatedAt').reverse().limit(200).toArray(),
          ]);
          const boxMap = new Map<string, any>(boxes.map((b: any) => [b.id, b]));
          const fallback = [
            ...boxes.map((b: any) => ({ kind: 'box', box: b } as SearchRow)),
            ...items.map((it: any) => ({ kind: 'item', item: it, box: boxMap.get(it.boxId) } as SearchRow)),
          ];
          setRows(fallback);
        } catch {}
      }
    }
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
      videoEl.setAttribute('playsinline', 'true');
      const result = await readerRef.current.decodeOnceFromVideoDevice(undefined, videoEl);
      const text = result.getText();
      const res = await searchByQrPayload(text);
      setRows(res);
    } catch {
      alert('QRの読み取りに失敗しました。もう一度お試しください。');
    } finally {
      setScanning(false);
      try { await readerRef.current?.reset(); } catch {}
    }
  };

  return (
    <div className="app-content content-edge-6">
      <div className="app-scroll">
        <section className="hk-frame">
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

          {rows.length === 0 && !scanning && (
            <p className="search-help">
              検索結果はここに表示されます。<br />
              <b>カメラ</b>をタップして<strong>箱のQR</strong>を読み取ると、該当の箱と中のアイテムが一覧表示されます。
            </p>
          )}

          {scanning && (
            <div style={{ marginTop: 8 }}>
              <video ref={videoRef} playsInline style={{ width: '100%', borderRadius: 8, border: '1px solid #eee' }} />
            </div>
          )}
        </section>

        {/* 共通レイアウト適用 */}
        <section aria-label="検索結果">
          {rows.length > 0 && (
            <ul className="divide-y">
              {rows.map((r, idx) => {
                if (r.kind === 'box') {
                  const b = r.box;
                  return (
                    <li key={`b-${b.id}-${idx}`}>
                      <ListRow
                        kind="box"
                        id={b.id}
                        name={b.name}
                        code={b.code}
                        location={b.location}
                        thumbUrl={b.thumbs?.[0] ?? null}
                        hrefDetail={`/boxes/${b.id}`}
                        hrefEdit={`/register?step=edit&boxId=${encodeURIComponent(b.id)}`}
                      />
                    </li>
                  );
                }
                if (r.kind === 'item') {
                  const it = r.item;
                  return (
                    <li key={`i-${it.id}-${idx}`}>
                      <ListRow
                        kind="item"
                        id={it.id}
                        name={it.name}
                        thumbUrl={it.thumbs?.[0] ?? null}
                        hrefDetail={`/items/${it.id}`}
                        hrefEdit={`/register?step=item&itemId=${encodeURIComponent(it.id)}`}
                      />
                    </li>
                  );
                }
                // 未登録コードは専用行（ListRowの対象外）
                return (
                  <li key={`u-${(r as any).code}-${idx}`} className="px-3 py-2">
                    <a
                      href={`/boxes/new?code=${encodeURIComponent((r as any).code)}`}
                      className="block rounded border p-3 hover:bg-muted"
                      aria-label="未登録コードの箱登録へ"
                    >
                      <div className="font-medium">📦 箱コード: <code>{(r as any).code}</code></div>
                      <div className="text-sm text-destructive">未登録（タップで箱の登録へ）</div>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
