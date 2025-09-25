// apps/web/src/components/QrLabel24.tsx
'use client';

type Props = {
  code: string;
  name: string;
  location?: string;
  qrSvg: string;      // makeQrSvg の戻り値（SVG文字列）
  qrSizeMm?: number;  // 14 or 16 を想定（既定14）
};

/**
 * 24mmテープ想定：幅24mm × 高さ20mm（例）
 * 左 14mm角にQR、右にテキスト3行。印刷時はスケール100%で。
 */
export default function QrLabel24({ code, name, location, qrSvg, qrSizeMm = 14 }: Props) {
  // 左列を QR の実寸に合わせる
  const gridCols = `${qrSizeMm}mm 1fr`;

  return (
    <div
      style={{
        width: '24mm',
        height: '20mm',
        padding: 0,
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: gridCols,
        gap: '1mm',
        alignItems: 'center',
        border: '1px dashed #ddd' // 画面目安。印刷時はCSSで非表示
      }}
      className="print-label"
    >
      {/* 左：QR（実寸 qrSizeMm にフィット） */}
      <div
        style={{ width: `${qrSizeMm}mm`, height: `${qrSizeMm}mm` }}
        dangerouslySetInnerHTML={{ __html: sizedQr(qrSvg, qrSizeMm) }}
      />
      {/* 右：テキスト */}
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontSize: '3mm',  fontFamily: 'sans-serif', fontWeight: 600 }}>{code}</div>
        <div style={{ fontSize: '2.5mm', fontFamily: 'sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontSize: '2.2mm', fontFamily: 'sans-serif', color: '#333' }}>{location ?? ''}</div>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: 24mm auto; margin: 0; }
          .print-label { border: none !important; }
          body { margin: 0 !important; }
        }
      `}</style>
    </div>
  );
}

/** 生成されたSVGに mm 指定を強制して等倍にする */
function sizedQr(svg: string, mm: number) {
  if (!svg) return '';
  return svg
    .replace(/width="[^"]*"/, '')
    .replace(/height="[^"]*"/, '')
    .replace('<svg', `<svg width="${mm}mm" height="${mm}mm" style="display:block"`);
}
