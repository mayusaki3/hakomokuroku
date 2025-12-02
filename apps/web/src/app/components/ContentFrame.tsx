// apps/web/src/app/components/ContentFrame.tsx
'use client';
import { PropsWithChildren, ReactNode } from 'react';

type Props = PropsWithChildren<{
  title?: string;
  right?: ReactNode; // 右上のボタン等
  divider?: boolean; // 見出し下の罫線
  style?: React.CSSProperties;
}>;

export default function ContentFrame({ title, right, divider = true, style, children }: Props) {
  const hasHead = !!title || !!right;
  return (
    <section className="hk-frame" style={style}>
      {hasHead && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {title && <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h1>}
          {right && <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{right}</div>}
        </div>
      )}
      {hasHead && divider && <hr className="hk-frame__hr" />}
      {children}
    </section>
  );
}
