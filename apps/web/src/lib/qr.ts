// apps/web/src/lib/qr.ts
'use client';
import QRCode from 'qrcode';

type QROpts = {
  /** Quiet Zone（余白）の太さ。推奨: 2〜4。0なら余白なし */
  margin?: number;
  /** 誤り訂正レベル（既定: 'M'） */
  ecl?: 'L' | 'M' | 'Q' | 'H';
};

/** データ文字列から SVG（文字列）を生成（mm指定は後段で付与） */
export async function makeQrSvg(data: string, opts: QROpts = {}) {
  const { margin = 2, ecl = 'M' } = opts;
  return await QRCode.toString(data, {
    type: 'svg',
    errorCorrectionLevel: ecl,
    margin, // ← Quiet Zone
  });
}
