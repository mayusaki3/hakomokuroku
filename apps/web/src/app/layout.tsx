import { Suspense } from 'react';
import Header from '@/app/components/Header';
import ContentArea from '@/app/components/layout/ContentArea';
import MobileTabBar from '@/app/components/MobileTabBar';
import ThemeRuntimeApplier from '@/app/components/ThemeRuntimeApplier';
import './globals.css';

import SWRegister from './sw-register';
import TokenMirror from '@/app/components/TokenMirror';
import SyncV2Runtime from '@/app/components/SyncV2Runtime';

export const metadata = {
  title: '箱目録',
  description: '箱の目録・QRラベル管理',
};

export const viewport = { themeColor: '#111827' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icons/maskable-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#111827" />
      </head>
      <body>
        <ThemeRuntimeApplier />
        <Suspense fallback={null}>
          <Header />
        </Suspense>

        <TokenMirror />
        <SyncV2Runtime />

        <div className="app-content">
          <ContentArea>{children}</ContentArea>
        </div>

        <Suspense fallback={null}>
          <MobileTabBar />
        </Suspense>
        <SWRegister />

      </body>
    </html>
  );
}
