// apps/web/src/app/register/page.tsx (server component)
import dynamic from 'next/dynamic';

export const metadata = { title: '登録 - 箱目録' };

// Register の実体はクライアントでのみ描画（Dexie/カメラ等のため）
const RegisterClient = dynamic(() => import('./RegisterClient'), {
  ssr: false,
  loading: () => <div style={{ padding: 16 }}>初期化中…</div>,
});

export default function Page() {
  return <RegisterClient />;
}
