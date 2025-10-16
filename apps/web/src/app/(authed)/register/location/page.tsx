'use client';
import RegisterStepNav from '@/app/components/RegisterStepNav';
// ここで最終「確定」=> ローカルDBへ書き込み & （任意で）/api/sync/push
export default function RegisterLocationPage() {
  return (
    <div className="container">
      <RegisterStepNav />
      <h2>⑤ 置き場所（写真＋メモ）</h2>
      <p>（ここに撮影→サムネ保存UIを後で実装）</p>
      <div style={{marginTop:12}}>
        <button className="btn">登録を確定（後で実装）</button>
      </div>
    </div>
  );
}
