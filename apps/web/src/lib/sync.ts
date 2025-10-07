import { loadSyncSettings } from '@/lib/sync-settings';
import { db } from '@/lib/db';

const LS_PULL = 'hk.sync.lastPullAt';
const LS_PUSH = 'hk.sync.lastPushAt';

function normalizeBase(raw: string) {
  const u = (raw ?? '').trim().replace(/\/+$/, '');
  if (!u) return '';
  return /\/api\/sync$/.test(u) ? u : (u + '/api/sync');
}

export async function pullFromServer() {
  const s = loadSyncSettings();
  const base = normalizeBase(s.endpoint);
  if (!base || !s.token) throw new Error('同期設定が未入力です');

  const since = localStorage.getItem(LS_PULL) ?? '';
  const url = since ? `${base}/pull?since=${encodeURIComponent(since)}` : `${base}/pull`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${s.token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Pull failed ${res.status}`);

  const json = await res.json(); // { boxes:[], items:[], locations:[] }

  // ここで Dexie へ反映（id が被るものは put）
  await db.transaction('rw', db.boxes, db.items, db.boxLocations, async () => {
    for (const b of json.boxes ?? []) await db.boxes.put(b);
    for (const it of json.items ?? []) await db.items.put(it);
    for (const loc of json.locations ?? []) await db.boxLocations.put(loc);
  });

  localStorage.setItem(LS_PULL, new Date().toISOString());
  return {
    boxes: (json.boxes ?? []).length,
    items: (json.items ?? []).length,
    locations: (json.locations ?? []).length,
  };
}

export async function pushToServer() {
  const s = loadSyncSettings();
  const base = normalizeBase(s.endpoint);
  if (!base || !s.token) throw new Error('同期設定が未入力です');

  const since = localStorage.getItem(LS_PUSH) ?? '1970-01-01T00:00:00.000Z';

  // 1) まず「変更のあったレコード」を拾う
  const [changedBoxes, changedItems, changedLocations] = await Promise.all([
    db.boxes.filter(x => x.updatedAt > since).toArray(),
    db.items.filter(x => x.updatedAt > since).toArray(),
    db.boxLocations.filter(x => x.updatedAt > since).toArray(),
  ]);

  // 2) Item/Location が参照する親 Box を収集（更新済みかどうかは問わない）
  const refBoxIds = new Set<string>([
    ...changedItems.map(i => i.boxId),
    ...changedLocations.map(l => l.boxId),
  ]);

  // 3) 親 Box を Dexie から取得して「必ず」同梱
  const parentBoxes = (await db.boxes.bulkGet([...refBoxIds]))
    .filter((b): b is NonNullable<typeof b> => !!b);

  // 4) payload の boxes は「変更のあった Box ＋ 親 Box」を重複排除して結合
  const allBoxesMap = new Map<string, any>();
  for (const b of [...parentBoxes, ...changedBoxes]) allBoxesMap.set(b.id, b);
  const boxes = [...allBoxesMap.values()];

  const items = changedItems;
  const locations = changedLocations;

  const res = await fetch(`${base}/push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${s.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ boxes, items, locations }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Push failed ${res.status}: ${t}`);
  }

  localStorage.setItem(LS_PUSH, new Date().toISOString());
  const ack = await res.json().catch(() => ({}));
  return {
    boxes: ack.boxes ?? boxes.length,
    items: ack.items ?? items.length,
    locations: ack.locations ?? locations.length,
  };
}
