// apps/web/src/app/layout.tsx
export const metadata = {
  title: 'hakomokuroku',
  description: '箱の目録・QRラベル管理',
};

export const viewport = {
  themeColor: '#111827',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body>{children}</body>
    </html>
  );
}
