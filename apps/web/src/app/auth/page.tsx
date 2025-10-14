'use client';
import { useState } from 'react';

type Mode = 'login' | 'register';

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [userName, setUserName] = useState('');

  async function saveToken(token: string) {
    const raw = localStorage.getItem('hk.sync');
    const cur = raw ? JSON.parse(raw) : {};
    localStorage.setItem('hk.sync', JSON.stringify({ ...cur, token }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (mode === 'login') {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId, password }),
        });
        if (!r.ok) throw new Error('login failed');
        const { token } = await r.json();
        await saveToken(token);
        window.location.href = '/';
      } else {
        const r = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId, password, userName }),
        });
        if (!r.ok) throw new Error('register failed');
        // 登録後はユーザー情報編集へ
        window.location.href = '/account';
      }
    } catch {
      // バックエンド未実装時のフォールバック
      if (mode === 'login') {
        await saveToken('DEMO_TOKEN');
        window.location.href = '/';
      } else {
        window.location.href = '/account';
      }
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
          <div className="row" style={{ justifyContent:'flex-end', marginTop:4 }}>
            <button className="btn btn-primary" type="submit">{mode==='login'?'ログイン':'登録へ'}</button>
          </div>
        </form>
        <p className="search-help" style={{ marginTop: 8 }}>
          ※ 成功時：ログイン→ホーム、登録→/account（ユーザー情報編集）。
        </p>
      </div>
    </main>
  );
}
