// apps/web/src/lib/backup.ts
'use client';
import JSZip from 'jszip';
import { db, Box, Item, ImageRec } from '@/lib/db';

// Blob を拡張子に変換する簡易関数（既定 webp）
function guessExt(blob?: Blob) {
  const t = blob?.type || '';
  if (t.includes('jpeg')) return 'jpg';
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('avif')) return 'avif';
  if (t.includes('svg')) return 'svg';
  if (t.includes('webp')) return 'webp';
  return 'webp';
}

export type ExportSummary = {
  boxes: number;
  items: number;
  images: number;
  bytes?: number;
  filename: string;
};

/** IndexedDB 全データを Zip にして返す（ダウンロードは呼び出し側で） */
export async function exportZip(): Promise<{ blob: Blob; summary: ExportSummary }> {
  const [boxes, items, images] = await Promise.all([
    db.boxes.toArray(),
    db.items.toArray(),
    db.images.toArray(),
  ]);

  const zip = new JSZip();

  // メタ（JSON）は blobs を含めない軽量スナップショットにする
  const boxesJson = boxes;
  const itemsJson = items;
  const imagesJson = images.map(({ blob, thumbBlob, ...meta }) => meta);

  zip.file('boxes.json', JSON.stringify(boxesJson, null, 2), { date: new Date() });
  zip.file('items.json', JSON.stringify(itemsJson, null, 2), { date: new Date() });
  zip.file('images.json', JSON.stringify(imagesJson, null, 2), { date: new Date() });
  zip.file(
    'manifest.json',
    JSON.stringify({
      app: 'hakomokuroku',
      version: 1,
      exportedAt: new Date().toISOString(),
      counts: { boxes: boxes.length, items: items.length, images: images.length },
    }, null, 2),
    { date: new Date() }
  );

  // 画像は個別ファイルとして格納
  const imgDir = zip.folder('images')!;
  const thumbDir = zip.folder('thumbs')!;
  for (const im of images) {
    if (im.blob) {
      const ext = guessExt(im.blob);
      imgDir.file(`${im.id}.${ext}`, im.blob, { date: new Date(im.createdAt) });
    }
    if (im.thumbBlob) {
      const extT = guessExt(im.thumbBlob);
      thumbDir.file(`${im.id}.${extT}`, im.thumbBlob, { date: new Date(im.createdAt) });
    }
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const summary: ExportSummary = {
    boxes: boxes.length, items: items.length, images: images.length, bytes: blob.size,
    filename: `hakomokuroku_${new Date().toISOString().replace(/[:.]/g,'-')}.zip`,
  };
  return { blob, summary };
}

// -------- Import --------

export type ImportResult = {
  added: { boxes: number; items: number; images: number };
  remapped: { boxes: number; items: number };
  warnings: string[];
};

/** Zip を読み込んで IndexedDB に追記（ID衝突・code重複は避けて挿入） */
export async function importZip(file: File): Promise<ImportResult> {
  const warnings: string[] = [];
  const zip = await JSZip.loadAsync(file);

  // JSON を読む
  const readJson = async <T>(name: string, def: T) => {
    const f = zip.file(name);
    if (!f) return def;
    try {
      const txt = await f.async('string');
      return JSON.parse(txt) as T;
    } catch {
      warnings.push(`${name} の解析に失敗しました`);
      return def;
    }
  };

  const boxes = await readJson<Box[]>('boxes.json', []);
  const items = await readJson<Item[]>('items.json', []);
  const imagesMeta = await readJson<Omit<ImageRec,'blob'|'thumbBlob'>[]>('images.json', []);

  // 既存の id セットと code セットを取っておく
  const [existingIds, existingCodes] = await Promise.all([
    db.boxes.toCollection().primaryKeys() as Promise<string[]>,
    db.boxes.toArray().then(xs => new Set(xs.map(x => x.code))),
  ]);
  const idSet = new Set(existingIds);
  const codeSet = existingCodes;

  // IDリマップ（衝突回避）
  const boxIdMap = new Map<string,string>();
  const itemIdMap = new Map<string,string>();

  function ensureUniqueCode(code: string) {
    if (!codeSet.has(code)) { codeSet.add(code); return code; }
    // 重複時は -IMP, -IMP2... を付ける
    let i = 1, c = `${code}-IMP`;
    while (codeSet.has(c)) { i += 1; c = `${code}-IMP${i}`; }
    codeSet.add(c);
    return c;
  }

  // 1) 追加用データを作る
  const boxesToAdd: Box[] = boxes.map(b => {
    const newId = idSet.has(b.id) ? crypto.randomUUID() : b.id;
    if (idSet.has(newId)) {
      // 極端な衝突対策
      let alt = crypto.randomUUID(); while (idSet.has(alt)) alt = crypto.randomUUID();
      boxIdMap.set(b.id, alt); idSet.add(alt);
      return { ...b, id: alt, code: ensureUniqueCode(b.code) };
    }
    boxIdMap.set(b.id, newId); idSet.add(newId);
    return { ...b, id: newId, code: ensureUniqueCode(b.code) };
  });

  const itemsToAdd: Item[] = items.map(it => {
    const newId = crypto.randomUUID();
    itemIdMap.set(it.id, newId);
    return { ...it, id: newId, boxId: boxIdMap.get(it.boxId) ?? it.boxId };
  });

  // 画像は zip から Blob を取り出して結合
  const imagesToAdd: ImageRec[] = [];
  for (const meta of imagesMeta) {
    const im: ImageRec = {
      ...meta,
      id: meta.id,
      boxId: meta.boxId ? (boxIdMap.get(meta.boxId) ?? meta.boxId) : undefined,
      itemId: meta.itemId ? (itemIdMap.get(meta.itemId) ?? meta.itemId) : undefined,
      blob: undefined,
      thumbBlob: undefined,
    };
    const main = zip.file(`images/${meta.id}.webp`) || zip.file(`images/${meta.id}.jpg`) ||
                 zip.file(`images/${meta.id}.jpeg`) || zip.file(`images/${meta.id}.png`) ||
                 zip.file(`images/${meta.id}.gif`) || zip.file(`images/${meta.id}.avif`);
    const th = zip.file(`thumbs/${meta.id}.webp`) || zip.file(`thumbs/${meta.id}.jpg`) ||
               zip.file(`thumbs/${meta.id}.jpeg`) || zip.file(`thumbs/${meta.id}.png`);

    if (main)  im.blob = await main.async('blob');
    if (th)    im.thumbBlob = await th.async('blob');
    imagesToAdd.push(im);
  }

  // 2) トランザクションで投入
  await db.transaction('rw', db.boxes, db.items, db.images, async () => {
    if (boxesToAdd.length) await db.boxes.bulkAdd(boxesToAdd);
    if (itemsToAdd.length) await db.items.bulkAdd(itemsToAdd);
    if (imagesToAdd.length) await db.images.bulkAdd(imagesToAdd);
  });

  return {
    added: { boxes: boxesToAdd.length, items: itemsToAdd.length, images: imagesToAdd.length },
    remapped: { boxes: boxesToAdd.filter((b,i)=>b.id!==boxes[i]?.id).length, items: itemsToAdd.length },
    warnings,
  };
}

/** Blob を保存（a要素の download を使う） */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
