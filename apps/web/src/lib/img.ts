// apps/web/src/lib/img.ts
export async function fileToThumbDataUrl(file: File, max = 640): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    el.src = url;
  });

  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function parseTags(input: string): string[] {
  return (input || '')
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
}
