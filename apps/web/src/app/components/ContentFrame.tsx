// apps/web/src/app/components/ContentFrame.tsx
"use client";
import { PropsWithChildren, ReactNode } from "react";

type Props = PropsWithChildren<{
  title?: string;
  right?: ReactNode;            // 右上のボタン類
  divider?: boolean;            // 見出し下の罫線表示
  style?: React.CSSProperties;
}>;

export default function ContentFrame({ title, right, divider = true, style, children }: Props) {
  return (
    <section className="hk-frame" style={style}>
      {(title || right) && (
        <div className="hk-frame__head">
          {title && <h1 className="hk-frame__title">{title}</h1>}
          {right && <div style={{ marginLeft:'auto' }}>{right}</div>}
        </div>
      )}
      {divider && (title || right) && <hr className="hk-frame__hr" />}
      {children}
    </section>
  );
}
