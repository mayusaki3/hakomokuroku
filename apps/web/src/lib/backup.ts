// apps/web/src/lib/backup.ts
import { db, Box, Item } from '@/lib/db';

export type BackupFile = {
  $schema: 'hakomokuroku-backup@1';
  exportedAt: string;
  counts: { boxes: number; items: number };
  boxes: (Box & { photoThumbs?: string[] })[];
  items: (Item & { photoThumbs?: string[] })[];
};

export async function getDbCounts() {
  const [boxes, items] = await Promise.all([db.boxes.count(), db.items.count()]);
  return { boxes, items };
}

export async function exportBackup(opts?: { includeThumbs?: boolean }) {
  const includeThumbs = opts?.includeThumbs ?? true;

  const [boxes, items] = await Promise.all([
    db.boxes.toArray(),
    db.items.toArray(),
  ]);

  // デフォルトでは photoThumbs をそのまま含む（重いと感じたら OFF に）
  const boxesOut = boxes.map(b => {
    const { id, code, name, location, tags, createdAt, updatedAt } = b;
    const anyB = b as any;
    return includeThumbs
      ? { id, code, name, location, tags, createdAt, updatedAt, photoThumbs: anyB.photoThumbs ?? [] }
      : { id, code, name, location, tags, createdAt, updatedAt };
  });

  const itemsOut = items.map(it => {
    const { id, boxId, name, tags, note, createdAt, updatedAt } = it;
    const anyI = it as any;
    return includeThumbs
      ? { id, boxId, name, tags, note, createdAt, updatedAt, photoThumbs: anyI.photoThumbs ?? [] }
      : { id, boxId, name, tags, note, createdAt, updatedAt };
  });

  const payload: BackupFile = {
    $schema: 'hakomokuroku-backup@1',
    exportedAt: new Date().toISOString(),
    counts: { boxes: boxes.length, items: items.length },
    boxes: boxesOut as any,
    items: itemsOut as any,
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const filename = `hakomokuroku-backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  return { blob, filename, size: blob.size };
}

/**
 * インポート
 * strategy:
 *  - 'merge'   : 既存とマージ。箱は code で突合、アイテムは id で突合。更新日時が新しい方を優先。
 *  - 'replace' : 既存を全消し後、バックアップをそのまま流し込み。
 */
export async function importBackup(file: File, strategy: 'merge' | 'replace' = 'merge') {
  const text = await file.text();
  const data = JSON.parse(text) as BackupFile;
  if (data.$schema !== 'hakomokuroku-backup@1') {
    throw new Error('バックアップ形式が不正です（schema ミスマッチ）');
  }

  if (strategy === 'replace') {
    await db.transaction('rw', db.boxes, db.items, async () => {
      await db.items.clear();
      await db.boxes.clear();

      const boxIdMap = new Map<string, string>(); // oldId -> newId
      for (const b of data.boxes) {
        const newId = crypto.randomUUID();
        boxIdMap.set(b.id, newId);
        const { id:_, ...rest } = b;
        await db.boxes.add({ id: newId, ...rest } as Box);
      }
      for (const it of data.items) {
        const newId = crypto.randomUUID();
        const { id:_, boxId: oldBoxId, ...rest } = it;
        const mappedBoxId = boxIdMap.get(oldBoxId);
        if (!mappedBoxId) continue; // 孤児は捨てる
        await db.items.add({ id: newId, boxId: mappedBoxId, ...rest } as Item);
      }
    });
    return;
  }

  // merge
  await db.transaction('rw', db.boxes, db.items, async () => {
    // 既存の boxes を code で引く
    const existingBoxes = await db.boxes.toArray();
    const byCode = new Map(existingBoxes.map(b => [b.code.toLowerCase(), b]));

    // code 突合で upsert。ID は既存のものを維持し、なければ新規。
    const codeToId = new Map<string, string>();
    for (const b of data.boxes) {
      const key = b.code.toLowerCase();
      const hit = byCode.get(key);
      const incomingNewer =
        hit ? (new Date(b.updatedAt).getTime() > new Date(hit.updatedAt).getTime()) : true;

      if (!hit) {
        const newId = crypto.randomUUID();
        codeToId.set(key, newId);
        const { id:_, ...rest } = b;
        await db.boxes.add({ id: newId, ...rest } as Box);
      } else {
        codeToId.set(key, hit.id);
        if (incomingNewer) {
          await db.boxes.update(hit.id, {
            name: b.name, location: b.location, tags: b.tags,
            updatedAt: b.updatedAt,
            // 任意フィールド
            ...(b as any).photoThumbs ? { photoThumbs: (b as any).photoThumbs } : {},
          } as any);
        }
      }
    }

    // items: id 突合。boxId は code から再マッピング。
    const existingItems = await db.items.toArray();
    const byId = new Map(existingItems.map(i => [i.id, i]));

    for (const it of data.items) {
      const hit = byId.get(it.id);
      // boxId を code からマップできるようにするため、バックアップに boxCode が無い前提では
      // 既存/新規の boxId を維持（replace では再割当済み）
      const incomingNewer =
        hit ? (new Date(it.updatedAt).getTime() > new Date(hit.updatedAt).getTime()) : true;

      if (!hit) {
        await db.items.add(it as Item);
      } else if (incomingNewer) {
        await db.items.update(hit.id, {
          name: it.name, tags: it.tags, note: it.note, boxId: it.boxId,
          updatedAt: it.updatedAt,
          ...(it as any).photoThumbs ? { photoThumbs: (it as any).photoThumbs } : {},
        } as any);
      }
    }
  });
}

export async function clearAllLocalData() {
  await db.transaction('rw', db.items, db.boxes, async () => {
    await db.items.clear();
    await db.boxes.clear();
  });
}
