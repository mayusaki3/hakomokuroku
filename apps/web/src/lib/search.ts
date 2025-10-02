// apps/web/src/lib/search.ts
import { db, Box, Item } from '@/lib/db';

export type SearchRow =
  | { kind: 'box'; box: Box }
  | { kind: 'item'; item: Item; box?: Box }
  | { kind: 'unregistered'; code: string };

const norm = (s: string) => (s || '').toLowerCase();

export async function searchByText(q: string): Promise<SearchRow[]> {
  const needle = norm(q.trim());
  if (!needle) return [];

  const [boxes, items] = await Promise.all([db.boxes.toArray(), db.items.toArray()]);

  const boxRows: SearchRow[] = boxes
    .filter(b => {
      const hay = `${b.code} ${b.name} ${b.location ?? ''} ${(b.tags ?? []).join(' ')}`;
      return norm(hay).includes(needle);
    })
    .map(b => ({ kind: 'box', box: b }));

  // まとめてMap化（アイテムに箱名を載せるため）
  const boxMap = new Map(boxes.map(b => [b.id, b]));
  const itemRows: SearchRow[] = items
    .filter(i => {
      const hay = `${i.name} ${(i.tags ?? []).join(' ')} ${i.note ?? ''}`;
      return norm(hay).includes(needle);
    })
    .map(i => ({ kind: 'item', item: i, box: boxMap.get(i.boxId) }));

  // ボックス優先で上、次にアイテム
  return [...boxRows, ...itemRows];
}

// QR ペイロードから箱コードを抽出（/b/<code> or そのまま）
export function extractBoxCodeFromQr(text: string): string | null {
  const s = text.trim();
  // try URL
  try {
    const u = new URL(s);
    const m = u.pathname.match(/\/b\/([^/]+)/);
    if (m) return decodeURIComponent(m[1]);
  } catch { /* not URL */ }

  // relative path "/b/..."
  const m2 = s.match(/(?:^|\/)b\/([^/]+)/);
  if (m2) return decodeURIComponent(m2[1]);

  // plain code (英数と - _ . のみを許容)
  if (/^[A-Za-z0-9._-]{2,64}$/.test(s)) return s;

  return null;
}

// QR 読み取り結果をホームの一覧用に整形
export async function searchByQrPayload(payload: string): Promise<SearchRow[]> {
  const code = extractBoxCodeFromQr(payload);
  if (!code) return [];

  const box = await db.boxes.where('code').equalsIgnoreCase(code).first();
  if (!box) {
    return [{ kind: 'unregistered', code }];
  }

  // 箱ヒット：箱 1件 + その箱のアイテム一覧
  const items = await db.items.where('boxId').equals(box.id).toArray();
  const rows: SearchRow[] = [{ kind: 'box', box }];
  rows.push(...items.map(i => ({ kind: 'item', item: i, box })));
  return rows;
}
