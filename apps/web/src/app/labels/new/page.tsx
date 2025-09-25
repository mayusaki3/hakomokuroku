'use client';
import { useEffect, useMemo, useState } from 'react';
import { generateBoxCode } from '@/lib/id';
import { makeQrSvg } from '@/lib/qr';
import QrLabel24 from '@/components/QrLabel24';

export default function NewLabelPage() {
  const [boxCode, setBoxCode] = useState('BX-8F3K');
  const [boxName, setBoxName] = useState('書籍Aダンボール');
  const [location, setLocation] = useState('押入れ上段');

  // ← QRサイズ(mm)とQuiet Zone（margin）
  const [qrSizeMm, setQrSizeMm] = useState<14 | 16>(14);
  const [qrMargin, setQrMargin] = useState<number>(2); // 0〜4 推奨

  const [qrSvg, setQrSvg] = useState<string>('');
  const url = useMemo(() => `https://app.example/box/${encodeURIComponent(boxCode)}`, [boxCode]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      const svg = await makeQrSvg(url, { margin: qrMargin, ecl: 'M' });
      if (!canceled) setQrSvg(svg);
    })();
    return () => { canceled = true; };
  }, [url, qrMargin]); // ← margin 変更でも再生成

  const handlePrint = () => window.print();

  const handleOpenTapePrint = () => {
    const params = new URLSearchParams({
      code: boxCode,
      name: boxName,
      location: location,
      n: '1',
      s: String(qrSizeMm),     // ← 追加: size
      m: String(qrMargin),     // ← 追加: margin
    });
    window.open(`/print/tape?${params.toString()}`, '_blank');
  };

  const handleOpenA4Print = () => {
    const params = new URLSearchParams({
      code: boxCode,
      name: boxName,
      location,
      n: '21',           // 既定の枚数（適宜変更）
      cols: '7',         // 既定列数
      gap: '2',          // ギャップmm
      s: String(qrSizeMm),
      m: String(qrMargin),
      o: 'portrait'
    });
    window.open(`/print/labels?${params.toString()}`, '_blank');
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>QRラベル作成</h1>
      <p>24mmテープ向け（PT-2430PC）</p>

      <form onSubmit={(e) => e.preventDefault()} style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        <label>箱コード
          <input value={boxCode} onChange={(e) => setBoxCode(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
        <label>箱名
          <input value={boxName} onChange={(e) => setBoxName(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
        <label>場所 / タグ
          <input value={location} onChange={(e) => setLocation(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>

        {/* QRサイズ・Quiet Zone */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label>QRサイズ(mm)
            <select value={qrSizeMm} onChange={(e) => setQrSizeMm(Number(e.target.value) as 14 | 16)} style={{ marginLeft: 8, padding: 6 }}>
              <option value={14}>14</option>
              <option value={16}>16</option>
            </select>
          </label>
          <label>Quiet Zone（margin）
            <select value={qrMargin} onChange={(e) => setQrMargin(Number(e.target.value))} style={{ marginLeft: 8, padding: 6 }}>
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2（推奨）</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
        </div>
      </form>

      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setBoxCode(generateBoxCode())} style={{ padding: '6px 10px' }}>
          コードを自動生成
        </button>
        <button onClick={handlePrint} style={{ padding: '6px 10px' }}>
          単票印刷（1枚）
        </button>
        <button type="button" onClick={handleOpenTapePrint} style={{ padding: '6px 10px' }}>
          テープ連続印刷ページへ
        </button>
        <button type="button" onClick={handleOpenA4Print} style={{ padding: '6px 10px' }}>
          A4面付けページへ
        </button>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2>プレビュー</h2>
        <div style={{ display: 'inline-flex', gap: '8mm', padding: '8mm', background: '#fafafa' }}>
          <QrLabel24 code={boxCode} name={boxName} location={location} qrSvg={qrSvg} qrSizeMm={qrSizeMm} />
        </div>
        <p style={{ marginTop: 8, color: '#555' }}>
          ※ 読み取り安定性が低ければ、まずは Quiet Zone を 2→3→4 と増やして試してください。<br />
          ※ 16mm にするとQRは大きくなりますが、その分テキスト領域が狭くなります。
        </p>
      </div>
    </main>
  );
}
