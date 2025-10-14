'use client';
import { useEffect, useState } from 'react';
import ListRow from '@/app/components/ListRow';

type Item = {
  id: string;
  boxId: string;
  name: string;
  tags?: string[];
  thumbs?: string[];
  updatedAt?: string;
};

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    (async () => {
      const { db } = await import('@/lib/db');
      const data = await db.items.orderBy('updatedAt').reverse().toArray();
      setItems(data);
    })();
  }, []);

  return (
    <main className="max-w-3xl mx-auto">
      <h1 className="sr-only">アイテム一覧</h1>
      <ul className="divide-y">
        {items.map((it) => (
          <li key={it.id}>
            <ListRow
              kind="item"
              id={it.id}
              name={it.name}
              thumbUrl={it.thumbs?.[0] ?? null}
              hrefDetail={`/items/${it.id}`}
              hrefEdit={`/register?step=item&itemId=${encodeURIComponent(it.id)}`}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
