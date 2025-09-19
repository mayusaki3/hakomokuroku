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
  const n = Math.max(1, Math.min(200, parseInt(sp.get('n') || '1', 10))); // 1..200
  const url = useMemo(() => `https://app.example/box/${encodeURIComponent(code)}`, [code]);

  const [qrSvg, setQrSvg] = useState('');
  useEffect(() => {
    let canceled = false;
    (async () => {
      const svg = await makeQrSvg(url);
      if (!canceled) setQrSvg(svg);
    })();
    return () => { canceled = true; };
  }, [url]);

  const labels = new Array(n).fill(null);

  return (
    <main style={{ padding: 0 }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2mm',            // 余白（プリンタの自動カットと併用）
        padding: '2mm 0 2mm 2mm',
        background: '#fff'
      }}>
        {labels.map((_, i) => (
          <div key={i} className="label-wrap">
            <QrLabel24 code={code} name={name} location={location} qrSvg={qrSvg} />
          </div>
        ))}
      </div>

      <style jsx global>{`
        @media print {
          /* 連続テープ幅: 24mm / 長さは自動（auto） */
          @page { size: 24mm auto; margin: 0; }
          body { margin: 0 !important; }
          .print-label { border: none !important; }
          .label-wrap { break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}
