import { db, type Box, type Item, type BoxLocation } from '@/lib/db';
import { loadSyncSettings } from '@/lib/sync-settings';

const LS_CURSOR = 'hk.sync.cursor';
const LS_LAST_PUSH = 'hk.sync.lastPushAt';

// --- Pull（カーソル方式） ---
export async function doPull() {
  const { endpoint, token } = loadSyncSettings();
  if (!endpoint || !token) throw new Error('同期設定が未設定です');

  const cursor = (typeof window !== 'undefined') ? (localStorage.getItem(LS_CURSOR) || '') : '';
  const url = new URL(`${endpoint}/pull`);
  if (cursor) url.searchParams.set('cursor', cursor);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Pull failed ${res.status}`);

  const data = await res.json() as {
    boxes: Box[];
    items: Item[];
    locations: BoxLocation[];
    cursor?: string;
  };

  await db.transaction('rw', db.boxes, db.items, db.boxLocations, async () => {
    if (data.boxes?.length) await db.boxes.bulkPut(data.boxes);
    if (data.items?.length) await db.items.bulkPut(data.items);
    if (data.locations?.length) await db.boxLocations.bulkPut(data.locations);
  });

  const nextCursor = data.cursor;
  if (nextCursor && typeof window !== 'undefined') {
    localStorage.setItem(LS_CURSOR, nextCursor);
  }
  return { received: {
    boxes: data.boxes?.length || 0,
    items: data.items?.length || 0,
    locations: data.locations?.length || 0,
  }};
}

// --- Push（簡易差分：lastPushAt 以降、なければ全件） ---
export async function doPush() {
  const { endpoint, token } = loadSyncSettings();
  if (!endpoint || !token) throw new Error('同期設定が未設定です');

  const since = (typeof window !== 'undefined') ? (localStorage.getItem(LS_LAST_PUSH) || '') : '';
  let boxes: Box[]; let items: Item[]; let locations: BoxLocation[];
  if (since) {
    boxes = await db.boxes.where('updatedAt').above(since).toArray();
    items = await db.items.where('updatedAt').above(since).toArray();
    locations = await db.boxLocations.where('updatedAt').above(since).toArray();
  } else {
    [boxes, items, locations] = await Promise.all([
      db.boxes.toArray(), db.items.toArray(), db.boxLocations.toArray(),
    ]);
  }

  const now = new Date().toISOString();
  const payload = { boxes, items, locations };

  const res = await fetch(`${endpoint}/push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Push failed ${res.status}: ${txt}`);
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(LS_LAST_PUSH, now);
  }
  return { sent: { boxes: boxes.length, items: items.length, locations: locations.length } };
}

// 既存呼び出し互換：pullFromServer / pushToServer
export async function pullFromServer() {
  return doPull();
}
export async function pushToServer() {
  return doPush();
}
