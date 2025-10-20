// apps/web/src/app/account/devices/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Token = {
  id: string; issuedAt: string; lastUsedAt?: string | null;
  deviceName?: string | null; userAgent?: string | null; ip?: string | null;
};

export default function AccountDevicesPage() {
  const router = useRouter();
  const [list, setList] = useState<Token[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const frame: React.CSSProperties = {
    border: '1px solid var(--hk-border,#e5e7eb)',
    borderRadius: 12, background: 'var(--hk-card,#fff)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: 12,
  };
  const hr: React.CSSProperties = { border: 0, borderTop: '1px solid var(--hk-border,#e5e7eb)', margin: '6px 0' };

  async function load() {
    setErr(null);
    const r = await fetch('/api/auth/tokens', { cache:'no-store' });
    if (!r.ok) { setErr('取得に失敗しました'); return; }
    const j = await r.json();
    setList(Array.isArray(j?.tokens) ? j.tokens : []);
  }

  useEffect(()=>{ load(); },[]);

  async function revoke(id: string) {
    setErr(null); setBusyId(id);
    try {
      const r = await fetch(`/api/auth/tokens/${encodeURIComponent(id)}`, { method:'DELETE' });
      if (!r.ok) { const j=await r.json().catch(()=>({})); setErr(j?.error||'失敗しました'); }
      await load();
    } finally { setBusyId(null); }
  }

  return (
    <main className="container" style={{ paddingTop: 4, maxWidth: 560, margin: '0 auto', paddingLeft: 8, paddingRight: 8 }}>
      <section style={frame}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <h1 style={{ margin:'2px 0 8px', fontWeight:700, fontSize:18 }}>デバイス管理</h1>
          <button className="btn" style={{ marginLeft:'auto' }} onClick={()=>router.back()}>戻る</button>
        </div>

        <hr style={hr} />

        <div style={{ display:'grid', gap:8 }}>
          {list.map(t => (
            <div key={t.id} style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px dashed #eee' }}>
              <div style={{ fontSize:14, lineHeight:1.3 }}>
                <div><b>{t.deviceName || '(不明な端末)'}</b></div>
                <div style={{ color:'#666', fontSize:12 }}>{t.userAgent}</div>
                <div style={{ color:'#666', fontSize:12 }}>
                  発行: {new Date(t.issuedAt).toLocaleString()} / 最終使用: {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : '—'} / IP: {t.ip || '—'}
                </div>
              </div>
              <button className="btn" onClick={()=>revoke(t.id)} disabled={busyId===t.id}>
                {busyId===t.id ? '無効化中…' : '無効化'}
              </button>
            </div>
          ))}
          {list.length===0 && <div style={{ color:'#666' }}>ログイン中のデバイスはありません。</div>}
          {err && <div style={{ color:'#b00' }}>{err}</div>}
        </div>
      </section>
    </main>
  );
}
