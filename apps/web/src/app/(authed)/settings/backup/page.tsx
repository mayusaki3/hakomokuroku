import Link from 'next/link';

/**
 * Legacy timestamp-based manual sync UI was retired with hk-local-v1.
 * Keep the route navigable until the v0.8 backup/restore UI is implemented.
 */
export default function BackupSettingsPage() {
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: 12 }}>
      <h1>バックアップ・復元</h1>
      <p>旧同期設定と手動PULL/PUSHは廃止されました。</p>
      <p>新しいバックアップ・復元画面は、v0.8のDB/API検証完了後に実装します。</p>
      <p><Link href="/settings">設定へ戻る</Link></p>
    </main>
  );
}
