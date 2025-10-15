'use client';
import { useState } from 'react';

export default function AuthTotpPage() {
  const sp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const loginId = sp.get('loginId') || '';
  const next = sp.get('next') || '/';

  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [err, setErr] = useState<string|null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    const r = await fetch('/api/auth/login/totp', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ loginId, code: code || undefined, recoveryCode: recovery || undefined }),
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) { setErr(j.error || 'invalid'); return; }
    const cur = JSON.parse(localStorage.getItem('hk.sync')||'{}');
    localStorage.setItem('hk.sync', JSON.stringify({ ...cur, token: j.token }));
    window.location.href = next;
  }

  return (
    <main className="container bottom-safe" style={{ display:'grid', gap:12, paddingTop:8 }}>
      <div className="card" style={{ padding:12 }}>
        <h2 style={{ margin:'4px 0 8px' }}>二段階認証</h2>
        <form onSubmit={submit} className="grid" style={{ gap:8 }}>
          <label className="row" style={{ alignItems:'center' }}>
            <span style={{ minWidth:120 }}>6桁コード</span>
            <input inputMode="numeric" pattern="\\d{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} />
          </label>
          <div className="text-sm text-muted-foreground">または</div>
          <label className="row" style={{ alignItems:'center' }}>
            <span style={{ minWidth:120 }}>回復コード</span>
            <input value={recovery} onChange={e=>setRecovery(e.target.value)} placeholder="8桁" />
          </label>
          {err && <div className="text-destructive text-sm">{err}</div>}
          <div className="row" style={{ justifyContent:'flex-end' }}>
            <button className="btn btn-primary" type="submit">送信</button>
          </div>
        </form>
      </div>
    </main>
  );
}
