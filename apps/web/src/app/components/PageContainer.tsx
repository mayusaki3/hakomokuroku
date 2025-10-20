// apps/web/src/app/components/PageContainer.tsx
"use client";
import { PropsWithChildren } from "react";

type Props = PropsWithChildren<{ safeBottom?: boolean; style?: React.CSSProperties }>;

export default function PageContainer({ safeBottom = true, style, children }: Props) {
  return (
    <main className={`hk-page ${safeBottom ? 'hk-page--safe-bottom' : ''}`} style={style}>
      {children}
    </main>
  );
}
