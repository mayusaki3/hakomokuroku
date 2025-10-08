'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const steps = [
  { href: '/register/box',        label: '箱' },
  { href: '/register/items',      label: 'アイテム' },
  { href: '/register/box-photos', label: '箱写真' },
  { href: '/register/label',      label: 'QR' },
  { href: '/register/location',   label: '置き場所' },
];

export default function RegisterStepNav() {
  const path = usePathname();
  return (
    <nav aria-label="登録ステップ" style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'8px',margin:'8px 0'}}>
      {steps.map(s => {
        const active = path.startsWith(s.href);
        return (
          <Link key={s.href} href={s.href} className="btn"
            style={{textAlign:'center', padding:'8px', border:'1px solid #ddd', borderRadius:8, background: active ? '#eef' : '#fff'}}>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
