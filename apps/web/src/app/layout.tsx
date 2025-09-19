// apps/web/src/app/layout.tsx
export const metadata = {
  title: 'hakomokuroku',
  description: '箱の目録・QRラベル管理',
  themeColor: '#111827',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#111827" />
      </head>
      <body>{children}</body>
    </html>
  );
}
