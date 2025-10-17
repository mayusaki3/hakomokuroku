// apps/web/src/app/auth/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Mode = 'login' | 'register';

export default function AuthPage() {
  const sp = useSearchParams();
  const next = sp.get('next') || '/';
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('login');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState(''); // 登録時のみ
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (sp.get('mode') === 'register') setMode('register');
  }, [sp]);

  const toggleLabel = useMemo(
    () => (mode === 'login' ? '新規登録へ' : 'ログインへ'),
    [mode]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        const r1 = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId, password, userName: userName || userId }),
        });
        if (!r1.ok) throw new Error('ユーザー登録に失敗しました');

        const r2 = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId, password }),
        });

        // TOTP 誘導（必要時）
        try {
          const j = await r2.json();
          if (j?.requireTotp && j?.loginId) {
            router.replace(`/auth/totp?loginId=${encodeURIComponent(j.loginId)}&next=${encodeURIComponent('/account')}`);
            return;
          }
        } catch {}
        window.dispatchEvent(new Event('hk:me:changed'));
        router.replace('/account');
      } else {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId, password }),
        });

        let j: any = null;
        try { j = await r.json(); } catch {}
        if (j?.requireTotp && j?.loginId) {
          router.replace(`/auth/totp?loginId=${encodeURIComponent(j.loginId)}&next=${encodeURIComponent(next)}`);
          return;
        }
        if (!r.ok) throw new Error('ログインに失敗しました');

        window.dispatchEvent(new Event('hk:me:changed'));
        router.replace(next);
      }
    } catch (e: any) {
      setErr(e?.message || 'エラーが発生しました');
    } finally {
      setBusy(false);
    }
  }

  // 共通枠（ユーザー情報ページに合わせる）
  const frame: React.CSSProperties = {
    border: '1px solid var(--hk-border,#e5e7eb)',
    borderRadius: 12,
    background: 'var(--hk-card,#fff)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    padding: 12,                 // ← account に合わせる
  };
  const hr: React.CSSProperties = { border: 0, borderTop: '1px solid var(--hk-border,#e5e7eb)', margin: '6px 0' }; // ← account に合わせる

  return (
    <main className="container" style={{ paddingTop: 4 /* ← account に合わせる */, maxWidth: 560, margin: '0 auto', paddingLeft: 8, paddingRight: 8 }}>
      <section className="card" style={frame}>
        {/* 行1：タイトル＋トグル */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 style={{ margin: '2px 0 8px', fontWeight: 700, fontSize: 18 }}>
            {mode === 'login' ? 'ログイン' : '新規登録'}
          </h1>
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="btn"
            style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
          >
            {toggleLabel}
          </button>
        </div>

        <hr style={hr} />

        {/* 行2：フォーム */}
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gridTemplateColumns: '100px 1fr', alignItems: 'center', gap: 8 }}>
            <span>ユーザーID</span>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              inputMode="text"
              autoComplete="username"
              className="input"
              placeholder="例) alice"
            />
          </label>

          {mode === 'register' && (
            <label style={{ display: 'grid', gridTemplateColumns: '100px 1fr', alignItems: 'center', gap: 8 }}>
              <span>ユーザー名</span>
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="input"
                placeholder="未入力ならユーザーIDを使用"
              />
            </label>
          )}

          <label style={{ display: 'grid', gridTemplateColumns: '100px 1fr', alignItems: 'center', gap: 8 }}>
            <span>パスワード</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="input"
            />
          </label>

          <hr style={hr} />

          {/* 行3：送信＋エラー */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            <button type="submit" className="btn" disabled={busy} style={{ height: 40 }}>
              {busy ? '送信中…' : mode === 'login' ? 'ログイン' : '登録してログイン'}
            </button>

            {err && <div style={{ color: '#b00' }}>{err}</div>}
          </div>
        </form>
      </section>
    </main>
  );
}
