// apps/web/src/app/(authed)/account/mfa/page.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AccountMfaPage() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null); // null=判定中

  const frame: React.CSSProperties = {
    border: '1px solid var(--hk-border,#e5e7eb)',
    borderRadius: 12, background: 'var(--hk-card,#fff)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: 12,
  };
  const hr: React.CSSProperties = { border: 0, borderTop: '1px solid var(--hk-border,#e5e7eb)', margin: '6px 0' };

  async function onSetup() {
    setErr(null);
    try {
      const r = await fetch('/api/auth/totp/setup', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.error || 'エラー'); return; }
      // 修正: QR 表示ページへ
      router.push('/auth/totp-setup');
    } catch { setErr('ネットワークエラー'); }
  }

  async function onDisable() {
    setErr(null);
    try {
      const r = await fetch('/api/auth/totp/disable', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.error || 'エラー'); return; }
      // 修正: ページを再読込（専用の無効化ページへは遷移しない）
      router.refresh();
    } catch { setErr('ネットワークエラー'); }
  }

  // 現在のTOTP有効状態を取得
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const r = await fetch('/api/auth/totp/status', { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!aborted) setTotpEnabled(!!j?.enabled);
      } catch {
        if (!aborted) setTotpEnabled(false);
      }
    })();
    return () => { aborted = true; };
  }, []);
  
  return (
    <div className="app-content content-edge-6">
      <div className="app-scroll">
        <section className="hk-frame">

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <h1 style={{ margin:'2px 0 8px', fontWeight:700, fontSize:18 }}>
              MFA（二段階認証）設定
            </h1>
            <button className="btn" style={{ marginLeft:'auto' }} onClick={()=>router.back()}>戻る</button>
          </div>

          <hr style={hr} />

          <div style={{ display:'grid', gap:8 }}>
            <button className="btn" onClick={onSetup}>TOTP をセットアップ</button>
            {totpEnabled && <button className="btn" onClick={onDisable}>TOTP を無効化</button>}
            {err && <div style={{ color:'#b00' }}>{err}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
