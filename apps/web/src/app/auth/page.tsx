'use client';
import { useState } from 'react';

type Mode = 'login' | 'register';

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [userName, setUserName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const next = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('next') || '/'
    : '/';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      if (mode === 'register') {
        const r = await fetch('/api/auth/register', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId, password, userName }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || 'register_failed');
        }
        // 登録後はプロフィール編集へ
        window.location.href = '/account';
        return;
      }

      // login
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'login_failed');

      if (j.need_totp) {
        // 次段で /auth/totp 実装予定（今は遷移のみ）
        window.location.href = `/auth/totp?loginId=${encodeURIComponent(j.loginId)}&next=${encodeURIComponent(next)}`;
        return;
      }

      // トークンを localStorage に保存（middleware 用CookieはサーバがSet-Cookie済みだが、既存フローも維持）
      const cur = JSON.parse(localStorage.getItem('hk.sync') || '{}');
      localStorage.setItem('hk.sync', JSON.stringify({ ...cur, token: j.token }));

      window.location.href = next;
    } catch (e: any) {
      setErr(e?.message || 'error');
    }
  }

  return (
    <main className="container bottom-safe" style={{ display:'grid', gap:12, paddingTop:8 }}>
      <div className="card" style={{ padding: 12 }}>
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          <button className={`btn ${mode==='login'?'btn-primary':''}`} onClick={()=>setMode('login')}>ログイン</button>
          <button className={`btn ${mode==='register'?'btn-primary':''}`} onClick={()=>setMode('register')}>新規登録</button>
        </div>
        <form onSubmit={onSubmit} className="grid" style={{ gap: 8 }}>
          <label className="row" style={{ alignItems:'center' }}>
            <span style={{ minWidth: 120 }}>ユーザーID</span>
            <input value={userId} onChange={e=>setUserId(e.target.value)} required />
          </label>
          <label className="row" style={{ alignItems:'center' }}>
            <span style={{ minWidth: 120 }}>パスワード</span>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
          </label>
          {mode === 'register' && (
            <label className="row" style={{ alignItems:'center' }}>
              <span style={{ minWidth: 120 }}>ユーザー名</span>
              <input value={userName} onChange={e=>setUserName(e.target.value)} />
            </label>
          )}
          {err && <div className="text-destructive text-sm">{err}</div>}
          <div className="row" style={{ justifyContent:'flex-end', marginTop:4 }}>
            <button className="btn btn-primary" type="submit">{mode==='login'?'ログイン':'登録へ'}</button>
          </div>
        </form>
      </div>
    </main>
  );
}
