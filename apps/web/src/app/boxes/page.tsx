'use client';
import { useEffect, useState } from 'react';
import ListRow from '@/app/components/ListRow';

type Box = {
  id: string;
  code: string;
  name: string;
  location?: string | null;
  tags?: string[];
  thumbs?: string[];
  updatedAt?: string;
};

export default function BoxesPage() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  useEffect(() => {
    (async () => {
      const { db } = await import('@/lib/db');
      const data = await db.boxes.orderBy('updatedAt').reverse().toArray();
      setBoxes(data);
    })();
  }, []);

  return (
    <main className="max-w-3xl mx-auto">
      <h1 className="sr-only">箱一覧</h1>
      <ul className="divide-y">
        {boxes.map((b) => (
          <li key={b.id}>
            <ListRow
              kind="box"
              id={b.id}
              name={b.name}
              code={b.code}
              location={b.location ?? undefined}
              thumbUrl={b.thumbs?.[0] ?? null}
              hrefDetail={`/boxes/${b.id}`}
              hrefEdit={`/register?step=edit&boxId=${encodeURIComponent(b.id)}`}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
