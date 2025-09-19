'use client';

type Props = {
  code: string;
  name: string;
  location?: string;
  qrSvg: string; // makeQrSvg の戻り値（SVG文字列）
};

/**
 * 24mmテープ想定：幅24mm × 高さ20mm（例）
 * 左 14mm角にQR、右にテキスト3行。印刷時はスケール100%で。
 */
export default function QrLabel24({ code, name, location, qrSvg }: Props) {
  return (
    <div
      style={{
        width: '24mm',
        height: '20mm',
        padding: 0,
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: '14mm 1fr',
        gap: '1mm',
        alignItems: 'center',
        border: '1px dashed #ddd' // 画面目安。印刷時はCSSで非表示
      }}
      className="print-label"
    >
      {/* 左：QR 14mm 四方にフィット */}
      <div
        style={{ width: '14mm', height: '14mm' }}
        dangerouslySetInnerHTML={{ __html: sizedQr(qrSvg) }}
      />
      {/* 右：テキスト */}
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontSize: '3mm', fontFamily: 'sans-serif', fontWeight: 600 }}>{code}</div>
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

/** 生成されたSVGに 14mm x 14mm を強制する */
function sizedQr(svg: string) {
  if (!svg) return '';
  // width/height を 14mm に付与（既存の viewBox はそのままでもOK）
  return svg
    .replace(/width="[^"]*"/, '')
    .replace(/height="[^"]*"/, '')
    .replace('<svg', '<svg width="14mm" height="14mm" style="display:block"');
}
