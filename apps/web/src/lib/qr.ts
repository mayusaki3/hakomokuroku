// apps/web/src/lib/qr.ts
'use client';
import QRCode from 'qrcode';

/** データ文字列から SVG（文字列）を生成 */
export async function makeQrSvg(data: string) {
  return await QRCode.toString(data, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    // width は後段で mm 指定するのでここでは指定しない
  });
}
