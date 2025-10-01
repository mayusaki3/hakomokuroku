// apps/web/src/lib/live.ts
'use client';
import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';

/**
 * Dexie.liveQuery を React で扱いやすくする薄いラッパー。
 * queryFn 内で参照するテーブルが更新されると自動で再実行されます。
 */
export function useDexieLive<T>(queryFn: () => Promise<T>, deps: any[], initial: T) {
  const [data, setData] = useState<T>(initial);
  const [err, setErr] = useState<Error | null>(null);

  useEffect(() => {
    setErr(null);
    const sub = liveQuery(queryFn).subscribe({
      next: (val) => setData(val),
      error: (e) => setErr(e as Error),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error: err };
}
