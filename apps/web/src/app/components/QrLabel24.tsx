'use client';

type Props = {
  code: string;
  name?: string;
  location?: string;
  qrSvg: string;
  qrSizeMm?: number;
  mmHeight?: number;
  mmPadding?: number;
  showText?: boolean;
};

/** Shared label preview/print component for A4 sheets and tape. */
export default function QrLabel24({
  code, name = '', location = '', qrSvg,
  qrSizeMm = 14, mmHeight = 20, mmPadding = 1, showText = true,
}: Props) {
  const qrSize = Math.max(10, Math.min(24, qrSizeMm));
  return (
    <div
      className="print-label"
      style={{
        width: '24mm',
        height: `${mmHeight}mm`,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: '1mm',
        padding: `${mmPadding}mm`,
        overflow: 'hidden',
        background: '#fff',
        border: '1px solid #eee',
      }}
    >
      <div
        style={{ width: `${qrSize}mm`, height: `${qrSize}mm`, flexShrink: 0, lineHeight: 0 }}
        aria-label={`箱コードQR: ${code}`}
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      {showText && (
        <div style={{ minWidth: 0, overflow: 'hidden', fontSize: '2mm', lineHeight: 1.2 }}>
          <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{code}</div>
          {name && <div style={{ overflowWrap: 'anywhere' }}>{name}</div>}
          {location && <div style={{ overflowWrap: 'anywhere' }}>{location}</div>}
        </div>
      )}
    </div>
  );
}
