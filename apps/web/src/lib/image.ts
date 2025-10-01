// apps/web/src/lib/image.ts
import * as exifr from 'exifr';

/** ファイルから EXIF Orientation を読む（失敗時は undefined） */
export async function readExifOrientation(file: File | Blob): Promise<number | undefined> {
  try {
    const o = await exifr.orientation(file as any);
    return typeof o === 'number' ? o : undefined;
  } catch {
    return undefined;
  }
}

/** 画像ファイルを読み込み、EXIF回転補正を適用しつつ長辺 maxPx に縮小して WebP Blob を返す */
export async function downscaleToWebp(file: File | Blob, maxPx = 1600, quality = 0.85) {
  const [img, orientation] = await Promise.all([
    loadImageFromBlob(file),
    readExifOrientation(file),
  ]);
  const { canvas, w, h } = drawDownscaledOriented(img, maxPx, orientation);
  const blob = await canvasToWebp(canvas, quality);
  return { blob, w, h, orientation };
}

/** サムネイルを作る（元ファイルから再デコード。向きも同様に補正） */
export async function makeThumbWebp(file: File | Blob, maxPx = 400, quality = 0.8) {
  const [img, orientation] = await Promise.all([
    loadImageFromBlob(file),
    readExifOrientation(file),
  ]);
  const { canvas, w, h } = drawDownscaledOriented(img, maxPx, orientation);
  const blob = await canvasToWebp(canvas, quality);
  return { blob, w, h, orientation };
}

// --- helpers ---
function loadImageFromBlob(blob: File | Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

function drawDownscaledOriented(img: HTMLImageElement, maxPx: number, orientation?: number) {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const rotate90 = orientation && orientation >= 5 && orientation <= 8;

  // まず画像の長辺を maxPx に収めるスケールを計算（向きに関わらずピクセル基準）
  const scale = Math.min(1, maxPx / Math.max(W, H));
  const sw = Math.round(W * scale);
  const sh = Math.round(H * scale);

  // キャンバスの出力サイズは、90/270度回転の場合は w/h が入れ替わる
  const cw = rotate90 ? sh : sw;
  const ch = rotate90 ? sw : sh;

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  applyExifTransform(ctx, cw, ch, orientation);

  // 変換後の座標系で (0,0)-(sw,sh) に描画
  ctx.drawImage(img, 0, 0, sw, sh);

  return { canvas, w: cw, h: ch };
}

/** EXIF Orientationに応じてキャンバス変換を適用 */
function applyExifTransform(ctx: CanvasRenderingContext2D, w: number, h: number, orientation?: number) {
  switch (orientation) {
    case 2: // Mirror horizontal
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      break;
    case 3: // Rotate 180
      ctx.translate(w, h);
      ctx.rotate(Math.PI);
      break;
    case 4: // Mirror vertical
      ctx.translate(0, h);
      ctx.scale(1, -1);
      break;
    case 5: // Mirror horizontal and rotate 270 CW
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6: // Rotate 90 CW
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -h);
      break;
    case 7: // Mirror horizontal and rotate 90 CW
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(w, -h);
      ctx.scale(-1, 1);
      break;
    case 8: // Rotate 270 CW
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-w, 0);
      break;
    // 1 or undefined: 変換なし
    default:
      break;
  }
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/webp', quality));
}
