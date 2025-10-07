import SWRegister from '@/app/sw-register';
import Header from '@/app/components/Header';
import { HeaderTitleProvider } from '@/app/components/HeaderTitleContext';
import MobileTabBar from '@/app/components/MobileTabBar';
import DevExposeDB from './dev-expose-db';
import './globals.css'

export const metadata = {
  title: '箱目録',                             // ← タイトルも統一
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
        <Header />
        <div className="app-content">
          <div className="container">{children}</div>
        </div>

        {children}
        {/* 開発時のみ露出 */}
        {process.env.NODE_ENV !== 'production' ? <DevExposeDB /> : null}

        <MobileTabBar />
        <SWRegister />
      </body>
    </html>
  );
}
