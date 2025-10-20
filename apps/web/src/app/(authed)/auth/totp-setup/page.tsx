'use client';
import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { useRouter } from 'next/navigation';

type SetupResp = { ok: true; otpauthUrl: string; secret: string; issuer?: string; label?: string } | { error: string };

export default function TotpSetupPage() {
  const router = useRouter();
  const [url, setUrl] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [err, setErr] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch('/api/auth/totp/setup', { method: 'POST' });
        const j = (await r.json()) as SetupResp;
        if (!r.ok || 'error' in j) { setErr(('error' in j && j.error) || 'セットアップに失敗しました'); return; }
        setUrl(j.otpauthUrl); setSecret(j.secret);
      } catch {
        setErr('ネットワークエラー');
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <main className="container" style={{ paddingTop: 4, maxWidth: 560, margin: '0 auto', paddingLeft: 8, paddingRight: 8 }}>
      <section style={{ border:'1px solid var(--hk-border,#e5e7eb)', borderRadius:12, background:'var(--hk-card,#fff)', boxShadow:'0 1px 2px rgba(0,0,0,0.04)', padding:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <h1 style={{ margin:'2px 0 8px', fontWeight:700, fontSize:18 }}>TOTP セットアップ</h1>
          <button className="btn" style={{ marginLeft:'auto' }} onClick={()=>router.back()}>戻る</button>
        </div>
        <hr style={{ border:0, borderTop:'1px solid var(--hk-border,#e5e7eb)', margin:'6px 0' }} />

        {loading && <div>読み込み中…</div>}
        {err && <div style={{ color:'#b00' }}>{err}</div>}

        {!loading && !err && (
          <div style={{ display:'grid', gap:12 }}>
            <div style={{ display:'grid', placeItems:'center' }}>
              <div style={{ background:'#fff', padding:12, borderRadius:8 }}>
                <QRCode value={url} size={192} />
              </div>
            </div>
            <div style={{ fontSize:12, color:'#666', textAlign:'center' }}>
              認証アプリ（Google Authenticator 等）でQRを読み取ってください。
            </div>

            <div style={{ display:'grid', gap:6 }}>
              <div style={{ fontSize:12, color:'#666' }}>手動入力用シークレット</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
                <code style={{ padding:'6px 8px', background:'#f7f7f7', borderRadius:6, overflowX:'auto' }}>{secret}</code>
                <button
                  className="btn"
                  onClick={() => navigator.clipboard.writeText(secret)}
                  title="コピー"
                >コピー</button>
              </div>
            </div>

            <hr style={{ border:0, borderTop:'1px solid var(--hk-border,#e5e7eb)', margin:'6px 0' }} />

            <div style={{ display:'grid', gap:8 }}>
              <button
                className="btn"
                onClick={() => router.push('/auth/totp?next=' + encodeURIComponent('/account'))}
                title="6桁コードで確認へ"
              >
                確認コード入力へ（6桁）
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
