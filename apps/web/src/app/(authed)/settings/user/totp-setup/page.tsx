'use client';
import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { useRouter } from 'next/navigation';

type Me = { userId: string };

function handle401(){
  try { localStorage.removeItem('hk.sync'); } catch {}
  document.cookie = 'hk_token=; Path=/; Max-Age=0; SameSite=Lax';
  location.replace('/auth');
}

export default function TotpSetupPage() {
  const router = useRouter(); 
  const [me, setMe] = useState<Me | null>(null);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [err, setErr] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [doneCodes, setDoneCodes] = useState<string[]|null>(null);

  async function onVerify() {
    setErr('');
    try {
      // url生成時に受け取った secret を使う
      if (!secret) { setErr('内部エラー: secret不在'); return; }
      const r = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ code, secret }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { setErr(j?.error || '確認に失敗しました'); return; }
      setDoneCodes(j.recoveryCodes as string[]);
    } catch {
      setErr('確認に失敗しました');
    }
  }

  // ユーザーID取得（ユーザー情報ページと同じ流れ）
  useEffect(() => {
    (async () => {
      const r = await fetch('/api/auth/me', { cache:'no-store', headers:{accept:'application/json'} });
      if (r.status === 401) return handle401();
      const j = await r.json();
      setMe({ userId: j.userId as string });
    })();
  }, []);
  
  // TOTPセットアップURL取得（POST + レスポンスキー：otpauthUrl）
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/totp/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}), // サーバ側で userId から生成
        });
        if (!res.ok) {
          setError('セットアップに失敗しました');
          return;
        }
        const data = await res.json();
        if (!data?.otpauthUrl || typeof data.otpauthUrl !== 'string') {
          setError('QRコードURLが空です');
          return;
        }
        setOtpAuthUrl(data.otpauthUrl);
      } catch {
        setError('セットアップに失敗しました');
      }
    })();
  }, []);

  return (
    <div className="app-content content-edge-6">
      <div className="app-scroll">
        <section className="hk-frame">
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <h2 style={{ margin:'2px 0 8px' }}>TOTP セットアップ</h2>
            <button className="btn" style={{ marginLeft:'auto' }} onClick={()=>router.back()}>戻る</button>
          </div>
          <hr style={{ border:0, borderTop:'1px solid var(--hk-border,#e5e7eb)', margin:'6px 0' }} />

          {loading && <div>読み込み中…</div>}

          {!loading && (
            <div style={{ display:'grid', gap:12 }}>
              <div style={{ display:'grid', placeItems:'center' }}>
                <div style={{ background:'#fff', padding:12, borderRadius:8 }}>
                  {typeof url === 'string' && url.length > 0
                    ? <QRCode value={url} size={192} />
                    : <div style={{ color:'#b00' }}>QRコードURLが空です</div>}
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

              <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:12 }}>
                6桁コード
                <input
                  className="form-input"
                  placeholder="123456"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e)=>setCode(e.target.value.replace(/\D/g,''))}
                  style={{ width:120 }}
                />
                <button className="btn" onClick={onVerify} disabled={!secret || code.length!==6}>確認・セットアップ</button>
              </div>

              {err && (
                <div role="alert" aria-live="polite" style={{ marginTop:12, color:'#b00' }}>
                  {err}
                </div>
              )}

              {Array.isArray(doneCodes) && (
                <div style={{ marginTop:12 }}>
                  <h3 style={{ margin:'8px 0' }}>回復コード（必ず保管してください）</h3>
                  <ul style={{ lineHeight:1.8 }}>
                    {doneCodes.map((c)=> <li key={c}><code>{c}</code></li>)}
                  </ul>
                  <div style={{ marginTop:8, display:'flex', gap:8 }}>
                    <button className="btn" onClick={()=>{
                      const blob = new Blob([doneCodes.join('\n')], { type:'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = 'recovery-codes.txt'; a.click();
                      URL.revokeObjectURL(url);
                    }}>ダウンロード</button>
                    <button className="btn" onClick={()=>location.replace('/account/mfa')}>完了</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
