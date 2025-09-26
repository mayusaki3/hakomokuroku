// 画像ファイルを読み込み、長辺 maxPx へ縮小して WebP Blob を返す
export async function downscaleToWebp(file: File, maxPx = 1600, quality = 0.85) {
  const img = await loadImageFromFile(file);
  const { canvas, w, h } = drawDownscaled(img, maxPx);
  const blob = await canvasToWebp(canvas, quality);
  return { blob, w, h };
}

// サムネイル生成（長辺 400px）
export async function makeThumbWebp(fileOrBlob: File | Blob, maxPx = 400, quality = 0.8) {
  const img = await loadImageFromBlob(fileOrBlob);
  const { canvas, w, h } = drawDownscaled(img, maxPx);
  const blob = await canvasToWebp(canvas, quality);
  return { blob, w, h };
}

// --- helpers ---
function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}
function loadImageFromBlob(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

function drawDownscaled(img: HTMLImageElement, maxPx: number) {
  const { naturalWidth: W, naturalHeight: H } = img;
  const scale = Math.min(1, maxPx / Math.max(W, H));
  const w = Math.round(W * scale);
  const h = Math.round(H * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, w, h };
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/webp', quality));
}
