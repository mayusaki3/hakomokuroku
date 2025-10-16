'use client';
import { useEffect, useState } from 'react';

export default function Header() {
  const [me, setMe] = useState<{ iconDataUrl?: string }|null>(null);
  async function load() {
    const r = await fetch('/api/auth/me', { cache:'no-store' });
    if (r.ok) setMe(await r.json());
  }
  useEffect(()=>{ load(); },[]);
  useEffect(()=>{
    const h = () => load();
    window.addEventListener('hk:me:changed', h);
    return () => window.removeEventListener('hk:me:changed', h);
  },[]);
  const icon = me?.iconDataUrl || '/icons/user-default.svg';
  return (
    <header>{/* ...既存 */}<img src={icon} className="h-8 w-8 rounded-full" alt="user" /></header>
  );
}
