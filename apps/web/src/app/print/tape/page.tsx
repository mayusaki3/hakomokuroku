'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QrLabel24 from '@/components/QrLabel24';
import { makeQrSvg } from '@/lib/qr';

export default function TapePrintPage() {
  const sp = useSearchParams();
  const code = sp.get('code') || 'BX-00000';
  const name = sp.get('name') || '箱名';
  const location = sp.get('location') || '';
  const n = Math.max(1, Math.min(200, parseInt(sp.get('n') || '1', 10)));

  // QRサイズ(mm)とQuiet Zone（margin）
  const qrSizeMm = Math.max(10, Math.min(24, parseInt(sp.get('s') || '14', 10))); // 既定14
  const qrMargin = Math.max(0, Math.min(8, parseInt(sp.get('m') || '2', 10)));    // 既定2

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

  return (
    <main style={{ padding: 0 }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2mm',
        padding: '2mm 0 2mm 2mm',
        background: '#fff'
      }}>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="label-wrap">
            <QrLabel24 code={code} name={name} location={location} qrSvg={qrSvg} qrSizeMm={qrSizeMm} />
          </div>
        ))}
      </div>
      <style jsx global>{`
        @media print {
          @page { size: 24mm auto; margin: 0; }
          body { margin: 0 !important; }
          .print-label { border: none !important; }
          .label-wrap { break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}
