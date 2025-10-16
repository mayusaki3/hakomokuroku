'use client';
import RegisterStepNav from '@/app/components/RegisterStepNav';
import { setDraftStep } from '@/lib/register-draft';

export default function RegisterBoxPhotosPage() {
  return (
    <div className="container">
      <RegisterStepNav />
      <h2>③ 箱の写真</h2>
      <p>（ここに撮影→サムネ保存UIを後で実装）</p>
      <div style={{marginTop:12}}>
        <button className="btn" onClick={async()=>{ await setDraftStep('label'); location.assign('/register/label'); }}>
          『QR』へ
        </button>
      </div>
    </div>
  );
}
