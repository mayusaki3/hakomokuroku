'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { makeQrSvg } from '@/lib/qr';
import QrLabel24 from '@/components/QrLabel24';

export default function LabelsA4Page() {
  const sp = useSearchParams();

  // ベース情報
  const code = sp.get('code') || 'BX-00000';
  const name = sp.get('name') || '箱名';
  const location = sp.get('location') || '';

  // 面付けパラメータ
  const n = Math.max(1, Math.min(999, parseInt(sp.get('n') || '21', 10)));   // 総枚数
  const cols = Math.max(1, Math.min(12, parseInt(sp.get('cols') || '7', 10)));// 列数
  const gap = Math.max(0, Math.min(10, parseFloat(sp.get('gap') || '2')));    // ラベル間ギャップ(mm)

  // QRサイズ & Quiet Zone
  const qrSizeMm = Math.max(10, Math.min(24, parseInt(sp.get('s') || '14', 10))); // 既定14
  const qrMargin = Math.max(0, Math.min(8, parseInt(sp.get('m') || '2', 10)));    // 既定2

  // 用紙向き
  const o = (sp.get('o') || 'portrait').toLowerCase(); // 'portrait' | 'landscape'
  const pageRule = o === 'landscape'
    ? '@page { size: A4 landscape; margin: 10mm; }'
    : '@page { size: A4 portrait;  margin: 10mm; }';

  // QR 生成（1回だけでOK）
  const url = useMemo(() => `https://app.example/box/${encodeURIComponent(code)}`, [code]);
  const [qrSvg, setQrSvg] = useState('');
  useEffect(() => {
    let canceled = false;
    (async () => {
      const svg = await makeQrSvg(url, { margin: qrMargin, ecl: 'M' });
      if (!canceled) setQrSvg(svg);
    })();
    return () => { canceled = true; };
  }, [url, qrMargin]);

  const rows = Math.ceil(n / cols);
  const labels = Array.from({ length: n });

  return (
    <main style={{ padding: 0 }}>
      {/* 画面専用ヘッダ（印刷時は非表示） */}
      <div className="no-print" style={{ padding: 16, position: 'sticky', top: 0, background: '#fff', borderBottom: '1px solid #eee', zIndex: 10 }}>
        <strong>/print/labels</strong> — A4面付け印刷（{o}, {cols}列, gap {gap}mm, n={n}, QR {qrSizeMm}mm, margin {qrMargin})
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => window.print()} style={{ padding: '6px 10px' }}>印刷</button>
          <a
            style={{ padding: '6px 10px', border: '1px solid #ddd', textDecoration: 'none' }}
            href={`?${new URLSearchParams({
              code, name, location,
              n: String(n), cols: String(cols),
              gap: String(gap), s: String(qrSizeMm), m: String(qrMargin),
              o: o === 'portrait' ? 'landscape' : 'portrait'
            }).toString()}`}
          >向きを{ o === 'portrait' ? '横' : '縦' }にする</a>
        </div>
        <p style={{ marginTop: 8, color: '#555' }}>
          ※ ブラウザ印刷で「余白なし／スケール100%」は必ずオフにし、<b>スケール=100%</b>にしてください（ここで余白10mmを確保しています）。
        </p>
      </div>

      {/* 面付けグリッド */}
      <div
        style={{
          // A4の余白（@page margin）を除いた内部はブラウザ任せでOK
          padding: 0,
          margin: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 24mm)`,
          gridAutoRows: '20mm',
          gap: `${gap}mm`,
          justifyContent: 'start',
          alignContent: 'start',
          background: '#fff'
        }}
      >
        {labels.map((_, i) => (
          <div key={i} className="label-wrap">
            <QrLabel24 code={code} name={name} location={location} qrSvg={qrSvg} qrSizeMm={qrSizeMm} />
          </div>
        ))}
      </div>

      <style jsx global>{`
        ${pageRule}
        @media print {
          body { margin: 0 !important; }
          .no-print { display: none !important; }
          .print-label { border: none !important; }
          .label-wrap { break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}
