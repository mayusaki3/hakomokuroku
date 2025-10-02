// apps/web/src/app/layout.tsx
import SWRegister from '@/app/sw-register';
import Header from '@/app/components/Header';
import MobileTabBar from '@/app/components/MobileTabBar';
import './globals.css'

export const metadata = {
  title: 'hakomokuroku',
  description: '箱の目録・QRラベル管理',
};

// ❗ Next.js の警告回避：themeColor は metadata ではなく viewport で指定
export const viewport = { themeColor: '#111827' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* iOS 用 */}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icons/maskable-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Android Chrome のバー色 */}
        <meta name="theme-color" content="#111827" />
      </head>
      <body style={{ background: '#f9fafb' }}>
        <Header />
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          {children}
        </div>
        <MobileTabBar />
        <SWRegister />
      </body>
    </html>
  );
}
