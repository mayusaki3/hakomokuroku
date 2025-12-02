'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type CtxType = { title: string | null; setTitle: (t: string | null) => void };
const TitleCtx = createContext<CtxType | null>(null);

export function HeaderTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return <TitleCtx.Provider value={{ title, setTitle }}>{children}</TitleCtx.Provider>;
}

/** ページ側から見出しを上書き。空文字/空白は null に正規化して、未指定扱いに。 */
export function useHeaderTitle(newTitle?: string | null) {
  const ctx = useContext(TitleCtx);
  useEffect(() => {
    if (!ctx) return;
    const toNull = (s: string | null | undefined) => (s && s.trim().length > 0 ? s : null);

    const prev = ctx.title;
    ctx.setTitle(toNull(newTitle));
    return () => ctx.setTitle(prev ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, newTitle]);
  return ctx?.title ?? null;
}

export function useCurrentHeaderTitle() {
  const ctx = useContext(TitleCtx);
  return ctx?.title ?? null;
}
