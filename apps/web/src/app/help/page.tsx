export default function HelpPage() {
  return (
    <main className="container" style={{ display: 'grid', gap: 12 }}>
      <h1>ヘルプ</h1>
      <p>・QRスキャンはHTTPSが必要（cloudflared/ngrok推奨）</p>
      <p>・オフラインは一度オンラインでページを開くと有効（PWA/Service Worker）</p>
      <p>・バックアップは「設定」からZipエクスポート/インポート</p>
    </main>
  );
}
