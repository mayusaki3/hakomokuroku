'use client';
import RegisterStepNav from '@/app/components/RegisterStepNav';
import { setDraftStep } from '@/lib/register-draft';

export default function RegisterItemsPage() {
  return (
    <div className="container">
      <RegisterStepNav />
      <h2>② アイテム追加</h2>
      <p>（ここに撮影→サムネ→登録UIを後で実装）</p>
      <div style={{ marginTop: 12 }}>
        <button
          className="btn"
          onClick={async () => {
            await setDraftStep('box-photos');
            location.assign('/register/box-photos');
          }}
        >
          『箱写真』へ
        </button>
      </div>
    </div>
  );
}
