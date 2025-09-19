'use client';
import { useEffect, useMemo, useState } from 'react';
import { generateBoxCode } from '@/lib/id';
import { makeQrSvg } from '@/lib/qr';
import QrLabel24 from '@/components/QrLabel24';

export default function NewLabelPage() {
  const [boxCode, setBoxCode] = useState('BX-8F3K');
  const [boxName, setBoxName] = useState('書籍Aダンボール');
  const [location, setLocation] = useState('押入れ上段');
  const [qrSvg, setQrSvg] = useState<string>('');

  const url = useMemo(() => `https://app.example/box/${encodeURIComponent(boxCode)}`, [boxCode]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      const svg = await makeQrSvg(url);
      if (!canceled) setQrSvg(svg);
    })();
    return () => { canceled = true; };
  }, [url]);

  const handlePrint = () => window.print();

  const handleOpenTapePrint = () => {
    const params = new URLSearchParams({
      code: boxCode,
      name: boxName,
      location: location,
      n: '1'
    });
    window.open(`/print/tape?${params.toString()}`, '_blank');
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>QRラベル作成</h1>
      <p>24mmテープ向け（PT-2430PC）</p>

      <form onSubmit={(e) => e.preventDefault()} style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
        <label>
          箱コード
          <input value={boxCode} onChange={(e) => setBoxCode(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
        <label>
          箱名
          <input value={boxName} onChange={(e) => setBoxName(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
        <label>
          場所 / タグ
          <input value={location} onChange={(e) => setLocation(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
      </form>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={() => setBoxCode(generateBoxCode())}
          style={{ padding: '6px 10px' }}
        >
          コードを自動生成
        </button>
        <button onClick={handlePrint} style={{ padding: '6px 10px' }}>
          単票印刷（1枚）
        </button>
        <button type="button" onClick={handleOpenTapePrint} style={{ padding: '6px 10px' }}>
          テープ連続印刷ページへ
        </button>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>プレビュー</h2>
        <div style={{ display: 'inline-flex', gap: '8mm', padding: '8mm', background: '#fafafa' }}>
          <QrLabel24 code={boxCode} name={boxName} location={location} qrSvg={qrSvg} />
        </div>
      </div>

      <p style={{ marginTop: 16, color: '#555' }}>
        ※ ブラウザ印刷で「余白なし / スケール100%」。まずコピー紙で確認→PT-2430PCで24mmテープに出力。
      </p>
    </main>
  );
}
