'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type CtxType = { title: string; setTitle: (t: string) => void };
const TitleCtx = createContext<CtxType | null>(null);

export function HeaderTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState('箱目録');
  return <TitleCtx.Provider value={{ title, setTitle }}>{children}</TitleCtx.Provider>;
}

/** ページ側で呼ぶ：useHeaderTitle('箱一覧') のように */
export function useHeaderTitle(newTitle?: string) {
  const ctx = useContext(TitleCtx);
  useEffect(() => {
    if (!ctx || !newTitle) return;
    const prev = ctx.title;
    ctx.setTitle(newTitle);
    return () => ctx.setTitle('箱目録'); // アンマウントで戻す
  }, [ctx, newTitle]);
  return ctx?.title ?? '箱目録';
}

/** ヘッダーが読む：現在のタイトルを取得 */
export function useCurrentHeaderTitle() {
  const ctx = useContext(TitleCtx);
  return ctx?.title ?? '箱目録';
}
