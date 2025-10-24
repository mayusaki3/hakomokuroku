// apps/web/src/app/components/PageContainer.tsx
'use client';
import { PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  safeBottom?: boolean;          // 余白調整が必要なら後続で使う。今は未使用。
  style?: React.CSSProperties;
  scroll?: boolean;              // iOSで枠内スクロールにしたい場合
}>;

export default function PageContainer({ style, children, scroll = false }: Props) {
  return (
    <main className="hk-page" style={style}>
      <div className={`app-content content-edge-6 ${scroll ? 'content-scroll' : ''}`}>
        {children}
      </div>
    </main>
  );
}
