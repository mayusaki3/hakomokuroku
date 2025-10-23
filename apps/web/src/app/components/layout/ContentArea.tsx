// コンテンツ部ラッパー: 上左右6pxの内側開始、下端は6px内側までスクロール可能にする
// 背景はテーマ変数(--content-bg / --content-wallpaper)で制御
export default function ContentArea({ children }: { children: React.ReactNode }) {
  return (
    <div className="content-area">
      {/* 縦積みの“コンテンツ枠”スタック。隙間は常に6px */}
      <div className="content-stack">
        {children}
      </div>
    </div>
  );
}
