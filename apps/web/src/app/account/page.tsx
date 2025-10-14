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
