'use client';
import { useEffect, useState } from 'react';

type UserProfile = {
  deviceName?: string;
  userId?: string;
  userName?: string;
  iconDataUrl?: string | null;
};

const KEY_USER = 'hk.user';

export default function AccountPage() {
  const [p, setP] = useState<UserProfile>({});
  const [password, setPassword] = useState(''); // 表示/入力のみ（保存しない）
  const [syncToken, setSyncToken] = useState<string>('');

  useEffect(() => {
    const raw = localStorage.getItem(KEY_USER);
    if (raw) setP(JSON.parse(raw));
    const sync = localStorage.getItem('hk.sync');
    if (sync) {
      try { setSyncToken(JSON.parse(sync).token ?? ''); } catch {}
    }
    // デバイス名の初期値（未設定時）
    setP(prev => prev.deviceName ? prev : { ...prev, deviceName: guessDeviceName() });
  }, []);

  function guessDeviceName() {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'このAndroid端末';
    if (/iPhone|iPad/i.test(ua)) return 'このiOS端末';
    if (/Windows/i.test(ua)) return 'このWindows PC';
    if (/Mac OS X/i.test(ua)) return 'このMac';
    return 'このデバイス';
  }

  function readToken(): string {
    try { return JSON.parse(localStorage.getItem('hk.sync') || '{}')?.token ?? ''; } catch { return ''; }
  }
  function writeToken(token?: string) {
    try {
      const cur = JSON.parse(localStorage.getItem('hk.sync') || '{}');
      if (token) localStorage.setItem('hk.sync', JSON.stringify({ ...cur, token }));
      else {
        delete cur.token;
        localStorage.setItem('hk.sync', JSON.stringify(cur));
      }
    } catch {}
  }

  // 同期トークン表示（コピー可）
  function TokenView() {
    const [t, setT] = useState('');
    useEffect(() => { setT(readToken()); }, []);
    return (
      <div className="row" style={{ alignItems:'center', gap:8 }}>
        <input value={t} readOnly placeholder="未ログイン／未取得" style={{ flex:1 }} />
        <button className="btn" onClick={() => { navigator.clipboard.writeText(t || ''); }}>コピー</button>
      </div>
    );
  }

  function TotpSection() {
    const [status, setStatus] = useState<{enabled:boolean; recoveryCount:number}>({enabled:false,recoveryCount:0});
    const [svg, setSvg] = useState(''); const [code, setCode] = useState(''); const [recovery, setRecovery] = useState<string[]|null>(null);
    const [msg, setMsg] = useState<string|undefined>();

    async function refresh() {
      const r = await fetch('/api/auth/me'); const j = await r.json();
      if (r.ok) setStatus({ enabled: j.totpEnabled, recoveryCount: j.recoveryCount });
    }
    useEffect(()=>{ refresh(); },[]);

    async function setup() {
      setMsg(undefined); setRecovery(null);
      const r = await fetch('/api/auth/totp/setup', { method:'POST' });
      const j = await r.json(); if (!r.ok) { setMsg(j.error||'setup_failed'); return; }
      setSvg(j.svg);
    }
    async function verify() {
      setMsg(undefined);
      const r = await fetch('/api/auth/totp/verify', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ code })});
      const j = await r.json(); if (!r.ok) { setMsg(j.error||'verify_failed'); return; }
      setRecovery(j.recoveryCodes); setSvg(''); setCode(''); await refresh();
    }
    async function disable() {
      const pw = prompt('パスワードを入力してください'); if (!pw) return;
      const r = await fetch('/api/auth/totp/disable', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ password: pw })});
      if (r.ok) { setSvg(''); setRecovery(null); setCode(''); await refresh(); }
    }
    // 再発行 = 無効化→セットアップ（確認UI）
    async function reissue() {
      if (!confirm('二段階認証を再発行します。現在の回復コードは無効になります。続行しますか？')) return;
      await disable(); await setup();
    }

    return (
      <section className="card" style={{ padding:12 }}>
        <h2 style={{ margin:'4px 0 8px' }}>二段階認証</h2>
        <div className="text-sm">状態：{status.enabled ? '有効' : '無効'}（回復コード残り: {status.recoveryCount}）</div>

        {!status.enabled && (
          <>
            <button className="btn mt-2" onClick={setup}>セットアップ開始（QR表示）</button>
            {svg && <div className="mt-2" dangerouslySetInnerHTML={{ __html: svg }} />}
            {svg && (
              <div className="row mt-2" style={{ alignItems:'center', gap:8 }}>
                <span style={{ minWidth:120 }}>6桁コード</span>
                <input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" maxLength={6} />
                <button className="btn btn-primary" onClick={verify}>有効化</button>
              </div>
            )}
          </>
        )}

        {status.enabled && (
          <div className="row mt-2" style={{ gap:8 }}>
            <button className="btn" onClick={reissue}>再発行（無効化→新規）</button>
            <button className="btn" onClick={disable}>無効化</button>
          </div>
        )}

        {recovery && (
          <div className="mt-3">
            <div className="text-sm">回復コード（必ず安全に保管）</div>
            <pre className="p-2 border rounded text-sm">{recovery.join('\n')}</pre>
          </div>
        )}
        {msg && <div className="text-destructive text-sm mt-2">{msg}</div>}
      </section>
    );
  }

  function sha256Hex(input: string): Promise<string> {
    const enc = new TextEncoder().encode(input);
    return crypto.subtle.digest('SHA-256', enc).then(buf =>
      Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    );
  }
  function readCurrentPlainToken(): string {
    try { return JSON.parse(localStorage.getItem('hk.sync') || '{}')?.token ?? ''; } catch { return ''; }
  }

  function TokenSection() {
    const [list, setList] = useState<Array<{id:string; tokenHash:string; issuedAt:string; expiresAt:string; lastUsedAt?:string|null;}>>([]);
    const [currentHash, setCurrentHash] = useState<string>('');
    const [editId, setEditId] = useState<string|null>(null);
    const [editName, setEditName] = useState('');

    async function refresh() {
      const r = await fetch('/api/auth/tokens');
      const j = await r.json();
      if (r.ok) setList(j.tokens || []);
      const plain = readCurrentPlainToken();
      setCurrentHash(plain ? await sha256Hex(plain) : '');
    }
    useEffect(()=>{ refresh(); },[]);

    // ラベル設定（現在トークンのみ）
    async function setLabelCurrent(name: string) {
      await fetch('/api/auth/tokens/label', {
        method:'POST', headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ deviceName: name }),
      });
      await refresh();
    }

    return (
      <section className="card" style={{ padding:12 }}>
        <h2 style={{ margin:'4px 0 8px' }}>ログイン中デバイス / トークン</h2>
        <div className="grid" style={{ gap:8 }}>
          {list.map(t => {
            const isCurrent = currentHash && t.tokenHash === currentHash;
            const label = t.deviceName || (isCurrent ? 'このデバイス' : '未設定デバイス');
            return (
              <div key={t.id} className="row" style={{ justifyContent:'space-between', alignItems:'center', gap:12 }}>
                <div className="col">
                  <div className="text-sm"><b>{label}</b>{isCurrent && '（現在）'}</div>
                  <div className="text-xs">
                    発行: {new Date(t.issuedAt).toLocaleString()} / 期限: {new Date(t.expiresAt).toLocaleString()}
                    {t.lastUsedAt && <> / 最終使用: {new Date(t.lastUsedAt).toLocaleString()}</>}
                    {t.userAgent && <><br/>UA: {t.userAgent}</>}
                  </div>
                </div>
                <div className="row" style={{ gap:8 }}>
                  {isCurrent ? (
                    editId === t.id ? (
                      <>
                        <input value={editName} onChange={e=>setEditName(e.target.value)} placeholder="デバイス名" />
                        <button className="btn btn-primary" onClick={async ()=>{ await setLabelCurrent(editName); setEditId(null); }}>保存</button>
                        <button className="btn" onClick={()=>setEditId(null)}>取消</button>
                      </>
                    ) : (
                      <button className="btn" onClick={()=>{ setEditId(t.id); setEditName(t.deviceName || ''); }}>名前を付ける</button>
                    )
                  ) : null}
                  <button className="btn" onClick={()=>revoke(t.id)}>無効化</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="row" style={{ justifyContent:'space-between', marginTop:12 }}>
          <button className="btn" onClick={async ()=>{
            // 初回ログイン直後に自動候補を付与
            const hint = `${navigator.platform || 'Device'} / ${navigator.language || ''}`.trim();
            await setLabelCurrent(hint);
          }}>このデバイスに名前を付ける（自動）</button>
          <button className="btn" onClick={revokeAll}>すべてログアウト</button>
        </div>
      </section>
    );

    async function revoke(id: string) {
      if (!confirm('このトークンを無効化しますか？')) return;
      await fetch('/api/auth/tokens/revoke', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id })});
      // もし現在トークンを消したならローカルも消す
      const t = list.find(x => x.id === id);
      if (t && t.tokenHash === currentHash) {
        localStorage.removeItem('hk.sync');
        document.cookie = 'hk_token=; Path=/; Max-Age=0; SameSite=Lax';
        location.href = '/auth';
        return;
      }
      refresh();
    }

    async function revokeAll() {
      if (!confirm('すべてのデバイスからログアウトします。続行しますか？')) return;
      await fetch('/api/auth/tokens/revokeAll', { method:'POST' });
      localStorage.removeItem('hk.sync');
      document.cookie = 'hk_token=; Path=/; Max-Age=0; SameSite=Lax';
      location.href = '/auth';
    }

    return (
      <section className="card" style={{ padding:12 }}>
        <h2 style={{ margin:'4px 0 8px' }}>ログイン中デバイス / トークン</h2>
        <div className="grid" style={{ gap:8 }}>
          {list.map(t => {
            const isCurrent = currentHash && t.tokenHash === currentHash;
            return (
              <div key={t.id} className="row" style={{ justifyContent:'space-between', alignItems:'center' }}>
                <div className="col">
                  <div className="text-sm">
                    <b>{isCurrent ? 'このデバイス' : '他デバイス'}</b>
                  </div>
                  <div className="text-xs">
                    発行: {new Date(t.issuedAt).toLocaleString()} / 期限: {new Date(t.expiresAt).toLocaleString()}
                    {t.lastUsedAt && <> / 最終使用: {new Date(t.lastUsedAt).toLocaleString()}</>}
                  </div>
                </div>
                <div>
                  <button className="btn" onClick={()=>revoke(t.id)}>無効化</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="row" style={{ justifyContent:'flex-end', marginTop:12 }}>
          <button className="btn" onClick={revokeAll}>すべてログアウト</button>
        </div>
      </section>
    );
  }

  // ログアウト：localStorageとCookieを消して /auth へ
  async function logout() {
    writeToken(undefined);                     // localStorage から削除
    document.cookie = 'hk_token=; Path=/; Max-Age=0; SameSite=Lax'; // Cookie削除（即時）
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    window.location.href = '/auth';
  }

  function onChange<K extends keyof UserProfile>(k: K, v: UserProfile[K]) {
    setP(prev => ({ ...prev, [k]: v }));
  }

  async function onPickIcon(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    onChange('iconDataUrl', dataUrl);
  }

  function onSave() {
    localStorage.setItem(KEY_USER, JSON.stringify(p));
    alert('保存しました');
  }

  return (
    <main className="container bottom-safe" style={{ display:'grid', gap:12, paddingTop:8 }}>
      <section className="card" style={{ padding: 12 }}>
        <h2 style={{ margin: '4px 0 8px', fontSize: 16 }}>ユーザー情報</h2>

        <div className="row" style={{ alignItems:'center' }}>
          <label style={{ minWidth: 140 }}>デバイス名（自動）</label>
          <input value={p.deviceName ?? ''} onChange={e=>onChange('deviceName', e.target.value)} />
        </div>

        <div className="row" style={{ alignItems:'center', marginTop:8 }}>
          <label style={{ minWidth: 140 }}>ユーザーID</label>
          <input value={p.userId ?? ''} onChange={e=>onChange('userId', e.target.value)} />
        </div>

        <div className="row" style={{ alignItems:'center', marginTop:8 }}>
          <label style={{ minWidth: 140 }}>パスワード</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="（変更時のみ入力）" />
        </div>

        <div className="row" style={{ alignItems:'center', marginTop:8 }}>
          <label style={{ minWidth: 140 }}>ユーザー名</label>
          <input value={p.userName ?? ''} onChange={e=>onChange('userName', e.target.value)} />
        </div>

        <div className="row" style={{ alignItems:'center', marginTop:8 }}>
          <label style={{ minWidth: 140 }}>アイコン</label>
          <input type="file" accept="image/*" onChange={onPickIcon} />
        </div>
        {p.iconDataUrl && (
          <div className="row" style={{ marginTop:8 }}>
            <img src={p.iconDataUrl} alt="icon preview" className="h-16 w-16 rounded-full object-cover" />
            <button className="btn" style={{ marginLeft: 8 }} onClick={()=>onChange('iconDataUrl', null)}>クリア</button>
          </div>
        )}

        <div className="row" style={{ alignItems:'center', marginTop:8 }}>
          <label style={{ minWidth: 140 }}>同期用トークン</label>
          <input value={syncToken} readOnly placeholder="認証後に自動設定" />
        </div>

        <div className="row" style={{ justifyContent:'flex-end', marginTop:12 }}>
          <button className="btn btn-primary" onClick={onSave}>保存</button>
        </div>
        <TotpSection />
        <TokenSection />
      </section>
      <section className="card" style={{ padding: 12 }}>
        <h2 style={{ margin: '4px 0 8px', fontSize: 16 }}>同期トークン</h2>
        <TokenView />
        <div className="row" style={{ justifyContent:'flex-end', marginTop:12 }}>
          <button className="btn" onClick={logout}>ログアウト</button>
        </div>
      </section>
    </main>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(r.error);
    r.onload = () => res(String(r.result));
    r.readAsDataURL(file);
  });
}
