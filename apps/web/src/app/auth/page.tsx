// apps/web/src/app/auth/page.tsx
'use client';

import { useRef, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Mode = 'login' | 'register';

export default function AuthPage() {
  // 画面表示時にテーマをデフォルトへ戻す
  useEffect(()=>{
    try{
      localStorage.removeItem('hk.themeActiveVars');
      localStorage.setItem('hk.themeActiveId','');
    }catch{}
    const root = document.documentElement;
    const keys = [
      'hk-wallpaper-image','hk-wallpaper-color','hk-content-bg',
      'hk-header-image','hk-header-fg',
      'hk-toolbar-bg','hk-toolbar-fg',
      'hk-input-bg','hk-input-fg','hk-input-border',
      'hk-btn-bg','hk-btn-fg','hk-btn-border'
    ];
    keys.forEach(k=>root.style.removeProperty(`--${k}`));
    root.style.setProperty('--hk-wallpaper-image','none');
    window.dispatchEvent(new Event('hk-theme-updated'));
  },[]);
  
  const sp = useSearchParams();
  const next = sp.get('next') || '/';
  const router = useRouter();
  const idRef = useRef<HTMLInputElement|null>(null);

  const [mode, setMode] = useState<Mode>('login');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState(''); // 登録時のみ
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (sp.get('mode') === 'register') setMode('register');
    const t = setTimeout(() => idRef.current?.focus(), 0);
    return () => clearTimeout(t);
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

  return (
    <main className="hk-page content-edge-6">
      <section className="hk-frame" style={{ maxWidth:560, margin:'0 auto' }}>
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

        <hr className="hk-frame__hr" />

        {/* 行2：フォーム（form-rowで統一） */}
        <form onSubmit={onSubmit} className="content-stack">
          <div className="form-row">
            <span className="form-label">ユーザーID</span>
            <input
              ref={idRef}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              inputMode="text"
              autoComplete="username"
              className="form-input"
              placeholder="例) alice"
            />
          </div>

          {mode === 'register' && (
            <div className="form-row">
              <span className="form-label">ユーザー名</span>
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="form-input"
                placeholder="未入力ならユーザーIDを使用"
              />
            </div>
          )}

          <div className="form-row">
            <span className="form-label">パスワード</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="form-input"
            />
          </div>

          <hr className="hk-frame__hr" />

          {/* 行3：送信＋エラー */}
          <div className="content-stack">
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
