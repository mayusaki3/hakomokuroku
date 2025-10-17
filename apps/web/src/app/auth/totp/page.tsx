// apps/web/src/app/auth/totp/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function TotpPage() {
  const sp = useSearchParams();
  const loginId = sp.get('loginId') || '';
  const next = sp.get('next') || '/';
  const router = useRouter();

  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [remain, setRemain] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 枠スタイル（ユーザー情報に合わせる）
  const frame: React.CSSProperties = {
    border: '1px solid var(--hk-border,#e5e7eb)',
    borderRadius: 12,
    background: 'var(--hk-card,#fff)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    padding: 12,
  };
  const hr: React.CSSProperties = {
    border: 0,
    borderTop: '1px solid var(--hk-border,#e5e7eb)',
    margin: '6px 0',
  };

  // 残り回復コード数（任意のステータスAPIがあれば）
  useEffect(() => {
    (async () => {
      if (!loginId) return;
      try {
        const r = await fetch(`/api/auth/totp/status?loginId=${encodeURIComponent(loginId)}`, { cache: 'no-store' });
        if (!r.ok) return; // ← 404は無視
        const j = await r.json();
        if (typeof j.recoveryRemain === 'number') setRemain(j.recoveryRemain);
      } catch {}
    })();
  }, [loginId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loginId) { setErr('セッションが無効です。最初からやり直してください。'); return; }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          loginId,
          code: code.trim() || undefined,
          recovery: recovery.trim() || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (typeof j.recoveryRemain === 'number') setRemain(j.recoveryRemain);
        setErr(j?.error || '認証に失敗しました');
        return;
      }
      window.dispatchEvent(new Event('hk:me:changed'));
      router.replace(next);
    } catch {
      setErr('ネットワークエラーです');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container" style={{ paddingTop: 4, maxWidth: 560, margin: '0 auto', paddingLeft: 8, paddingRight: 8 }}>
      <section style={frame}>
        {/* 見出し行 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 style={{ margin: '2px 0 8px', fontWeight: 700, fontSize: 18 }}>MFA（二段階認証）</h1>
          <button type="button" className="btn" onClick={() => router.back()} style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            戻る
          </button>
        </div>

        <hr style={hr} />

        {/* 入力行 */}
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gridTemplateColumns: '100px 1fr', alignItems: 'center', gap: 8 }}>
            <span>6桁コード</span>
            <input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="input"
              placeholder="123456"
            />
          </label>

          <div style={{ color: '#666', fontSize: 12 }}>または</div>

          <label style={{ display: 'grid', gridTemplateColumns: '100px 1fr', alignItems: 'center', gap: 8 }}>
            <span>回復コード</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
              <input
                value={recovery}
                onChange={(e) => setRecovery(e.target.value)}
                className="input"
                placeholder="例) abcd-efgh-ijkl"
              />
              <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>
                残り {remain ?? '—'} 件
              </span>
            </div>
          </label>

          <hr style={hr} />

          <div style={{ display: 'grid', gap: 8 }}>
            <button type="submit" className="btn" disabled={busy} style={{ height: 40 }}>
              {busy ? '送信中…' : '認証コード送信'}
            </button>
            {err && <div style={{ color: '#b00' }}>{err}</div>}
          </div>
        </form>
      </section>
    </main>
  );
}
