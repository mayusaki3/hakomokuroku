'use client';
import { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** アイコン（<Search size={..}/> など） */
  icon: ReactNode;
  /** アクセシビリティ用ラベル */
  ariaLabel: string;
  /** 一辺のサイズ(px) デフォルト40 */
  box?: number;
};

export default function IconButton({ icon, ariaLabel, box = 30, style, ...rest }: Props) {
  return (
    <button
      className="btn"
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{
        width: box,
        height: box,
        padding: 0,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {icon}
    </button>
  );
}
