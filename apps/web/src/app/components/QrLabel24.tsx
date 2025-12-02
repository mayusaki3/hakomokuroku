'use client';

import { useMemo } from 'react';
import { makeQrSvg } from '@/lib/qr';

type Props = {
  code: string;
  /** ラベル高さ（mm）。24mmテープ想定だが、必要なら変更可 */
  mmHeight?: number;
  /** 余白（mm） */
  mmPadding?: number;
  /** QRの物理サイズ（mm） */
  mmQr?: number;
  /** テキスト表示の有無 */
  showText?: boolean;
};

/**
 * 24mmテープ向けの簡易QRラベル（プレビュー/印刷兼用）
 * - mm単位でサイズを指定（印刷時に実寸に近づけやすい）
 * - 画面表示ではCSSがmm→px換算されるため、見た目は環境で若干変わります
 */
export default function QrLabel24({
  code,
  mmHeight = 24,
  mmPadding = 2,
  mmQr = 20,
  showText = true,
}: Props) {
  // 高解像度SVGを生成してCSSで物理サイズへ縮小
  const qrSvg = useMemo(() => {
    // 余裕をもって512pxで生成（印刷時のスケール縮小でシャープに出やすい）
    return makeQrSvg(code, 512); // string (SVG)
  }, [code]);

  return (
    <div
      style={{
        height: `${mmHeight}mm`,
        display: 'flex',
        alignItems: 'center',
        gap: `${Math.max(1, Math.min(mmPadding, 6))}mm`,
        padding: `${mmPadding}mm`,
        background: '#fff',
        border: '1px solid #eee', // 画面確認用。印刷では気になる場合は外してOK
        borderRadius: 6,
      }}
    >
      {/* QR本体（SVGをそのまま埋め込み） */}
      <div
        style={{
          width: `${mmQr}mm`,
          height: `${mmQr}mm`,
          lineHeight: 0,
        }}
        aria-label="箱コードQR"
        // makeQrSvg が返す <svg ...> をそのまま表示
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />

      {/* 右側テキスト（任意） */}
      {showText && (
        <div style={{ display: 'grid', gap: 2 }}>
          <div style={{ fontSize: '3.2mm', fontWeight: 700, lineHeight: 1.1 }}>箱目録</div>
          <code style={{ fontSize: '3.4mm', lineHeight: 1.1 }}>{code}</code>
        </div>
      )}
    </div>
  );
}
