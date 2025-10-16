'use client';
import RegisterStepNav from '@/app/components/RegisterStepNav';
import { setDraftStep } from '@/lib/register-draft';

export default function RegisterLabelPage() {
  return (
    <div className="container">
      <RegisterStepNav />
      <h2>④ QRラベル発行</h2>
      <p>（ここに印刷プレビュー/発行UIを後で実装）</p>
      <div style={{marginTop:12}}>
        <button className="btn" onClick={async()=>{ await setDraftStep('location'); location.assign('/register/location'); }}>
          『置き場所』へ
        </button>
      </div>
    </div>
  );
}
