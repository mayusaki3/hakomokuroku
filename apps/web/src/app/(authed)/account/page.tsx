// apps/web/src/app/(authed)/account/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Camera, Image as ImageIcon, RotateCwSquare, Pencil, Check, X,
  Shield, Monitor, Settings, LogOut
} from 'lucide-react';

type Me = { userId: string; userName?: string | null; iconDataUrl?: string | null; totpEnabled: boolean; recoveryCount: number; };

function handle401() {
  try { localStorage.removeItem('hk.sync'); } catch {}
  document.cookie = 'hk_token=; Path=/; Max-Age=0; SameSite=Lax';
  location.replace('/auth');
}

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);

  // ユーザー名編集
  const [editingUserName, setEditingUserName] = useState(false);
  const [userNameDraft, setUserNameDraft] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  // デバイス名編集
  const [deviceName, setDeviceName] = useState('');
  const [deviceNameDraft, setDeviceNameDraft] = useState('');
  const [editingDeviceName, setEditingDeviceName] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);

  // アイコン入力ref
  const fileRefCamera = useRef<HTMLInputElement>(null);
  const fileRefPicker = useRef<HTMLInputElement>(null);

  useEffect(() => { (async () => {
    const r = await fetch('/api/auth/me', { cache:'no-store', headers:{accept:'application/json'} });
    if (r.status === 401) return handle401();
    const j: Me = await r.json();
    setMe(j);
    setUserNameDraft(j.userName ?? '');

    // 現在デバイス名の取得
    try {
      const cur = JSON.parse(localStorage.getItem('hk.sync') || '{}');
      const token: string = cur?.token || '';
      if (!token) return;
      const enc = new TextEncoder().encode(token);
      const h = await crypto.subtle.digest('SHA-256', enc);
      const hash = Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');
      const rt = await fetch('/api/auth/tokens', { cache:'no-store' });
      if (rt.status === 401) return handle401();
      const jt = await rt.json();
      const self = (jt.tokens || []).find((t: any) => t.tokenHash === hash);
      const name = self?.deviceName ?? '';
      setDeviceName(name);
      setDeviceNameDraft(name);
    } catch {}
  })(); }, []);

  async function uploadIcon(file: File) {
    const buf = await file.arrayBuffer();
    const r = await fetch('/api/account/icon', { method:'POST', body: buf, headers:{'content-type': file.type || 'application/octet-stream'} });
    if (r.status === 401) return handle401();
    const j = await r.json().catch(()=>({}));
    if (r.ok) {
      setMe(m => m ? ({ ...m, iconDataUrl: j.iconDataUrl }) : m);
      window.dispatchEvent(new Event('hk:me:changed'));
    }
  }
  async function uploadIconFromBlob(blob: Blob) {
    const r = await fetch('/api/account/icon', { method:'POST', body: await blob.arrayBuffer(), headers:{'content-type': blob.type || 'application/octet-stream'} });
    if (r.status === 401) return handle401();
    const j = await r.json().catch(()=>({}));
    if (r.ok) {
      setMe(m => m ? ({ ...m, iconDataUrl: j.iconDataUrl }) : m);
      window.dispatchEvent(new Event('hk:me:changed'));
    }
  }
  async function rotateIcon90() {
    const src = me?.iconDataUrl || '/icons/user-default.svg';
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      // 256x256 正方形で90度回転して書き出し
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0,0,size,size);
      ctx.translate(size/2, size/2);
      ctx.rotate(90 * Math.PI / 180);
      ctx.drawImage(img, -size/2, -size/2, size, size);
      const blob: Blob = await new Promise(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.9)!);
      await uploadIconFromBlob(blob);
    };
    img.src = src;
  }

  async function saveUserName() {
    setSavingUser(true);
    const r = await fetch('/api/account/profile', { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ userName: userNameDraft }) });
    setSavingUser(false);
    if (r.status === 401) return handle401();
    if (r.ok) {
      const j = await r.json();
      setMe(m => m ? ({ ...m, userName: j.userName }) : m);
      setEditingUserName(false);
      window.dispatchEvent(new Event('hk:me:changed'));
    }
  }

  async function saveDeviceName() {
    setSavingDevice(true);
    const r = await fetch('/api/auth/tokens/label', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ deviceName: deviceNameDraft }) });
    setSavingDevice(false);
    if (r.status === 401) return handle401();
    if (r.ok) { setDeviceName(deviceNameDraft); setEditingDeviceName(false); }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method:'POST' });
    try { localStorage.removeItem('hk.sync'); } catch {}
    document.cookie = 'hk_token=; Path=/; Max-Age=0; SameSite=Lax';
    location.href = '/auth';
  }

  if (!me) return <main className="container">Loading...</main>;

  const row = { display:'flex', alignItems:'center', gap:8, flexWrap:'nowrap' as const };
  const label = { minWidth:100, whiteSpace:'nowrap' as const };
  const inputStyle = { flex:1, minWidth:0 };

  return (
    <main className="container" style={{ paddingTop:4 }}>
      <section className="card" style={{ padding:12 }}>
        <h2 style={{ margin:'2px 0 8px' }}>ユーザー情報</h2>

        <hr style={{ margin:'6px 0' }} />

        {/* 上段ブロック：左＝アイコン／右＝(上)ID・(下)操作ボタン（各行を上下中央に） */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 12,
            alignItems: 'center', // 左右行を縦中央揃え
          }}
        >
          {/* 左：アイコン */}
          <div>
            <img
              src={me.iconDataUrl || '/icons/user-default.svg'}
              alt="user"
              width={96}
              height={96}
              className="rounded-full"
              style={{ objectFit: 'cover' }}
            />
          </div>

          {/* 右：上下2段（各行コンテンツを上下中央に） */}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: 'auto auto',
              rowGap: 8,
              alignItems: 'center', // ← 各行の内容を縦中央
            }}
          >
            {/* 右上：ID（左端寄せ） */}
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'nowrap', justifyContent:'flex-start' }}>
              <span style={{ minWidth:30, whiteSpace:'nowrap' }}>ID :</span>
              <div style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                <b>{me.userId}</b>
              </div>
            </div>

            {/* 右下：カメラ / 画像 / 回転（縦中央・左寄せ） */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start' }}>
              <input
                ref={fileRefCamera}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadIcon(f); }}
              />
              <input
                ref={fileRefPicker}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadIcon(f); }}
              />
              <button className="btn" aria-label="カメラで撮影" onClick={() => fileRefCamera.current?.click()}><Camera size={16} /></button>
              <button className="btn" aria-label="画像を選択" onClick={() => fileRefPicker.current?.click()}><ImageIcon size={16} /></button>
              <button className="btn" aria-label="90度回転" onClick={rotateIcon90}><RotateCwSquare size={16} /></button>
            </div>
          </div>
        </div>

        <hr style={{ margin:'6px 0' }} />

        {/* 中段：ユーザー名 */}
        <div style={{ ...row }}>
          <span style={label}>ユーザー名</span>
          <input
            value={userNameDraft}
            onChange={e=>setUserNameDraft(e.target.value)}
            maxLength={50}
            readOnly={!editingUserName}
            aria-readonly={!editingUserName}
            className={!editingUserName ? 'opacity-70 pointer-events-none' : ''}
            style={inputStyle}
            onKeyDown={(e)=>{ if (!editingUserName) return; if (e.key==='Enter') saveUserName(); if (e.key==='Escape'){ setUserNameDraft(me.userName ?? ''); setEditingUserName(false);} }}
          />
          {!editingUserName ? (
            <button className="btn" aria-label="編集" onClick={()=>setEditingUserName(true)}><Pencil size={16} /></button>
          ) : (
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn btn-primary" aria-label="保存" disabled={savingUser || (me.userName ?? '')===userNameDraft} onClick={saveUserName}><Check size={16} /></button>
              <button className="btn" aria-label="キャンセル" onClick={()=>{ setUserNameDraft(me.userName ?? ''); setEditingUserName(false); }}><X size={16} /></button>
            </div>
          )}
        </div>

        {/* 中段：デバイス名 */}
        <div style={{ ...row, marginTop:8 }}>
          <span style={label}>デバイス名</span>
          <input
            value={deviceNameDraft}
            onChange={e=>setDeviceNameDraft(e.target.value)}
            maxLength={80}
            readOnly={!editingDeviceName}
            aria-readonly={!editingDeviceName}
            className={!editingDeviceName ? 'opacity-70 pointer-events-none' : ''}
            style={inputStyle}
            placeholder={deviceName ? '' : '未設定'}
            onKeyDown={(e)=>{ if (!editingDeviceName) return; if (e.key==='Enter') saveDeviceName(); if (e.key==='Escape'){ setDeviceNameDraft(deviceName); setEditingDeviceName(false);} }}
          />
          {!editingDeviceName ? (
            <button className="btn" aria-label="編集" onClick={()=>setEditingDeviceName(true)}><Pencil size={16} /></button>
          ) : (
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn btn-primary" aria-label="保存" disabled={savingDevice || deviceNameDraft===deviceName} onClick={saveDeviceName}><Check size={16} /></button>
              <button className="btn" aria-label="キャンセル" onClick={()=>{ setDeviceNameDraft(deviceName); setEditingDeviceName(false); }}><X size={16} /></button>
            </div>
          )}
        </div>

        <hr style={{ margin:'6px 0' }} />

        {/* 下段：MFA/デバイス管理/設定（各ボタン＝幅の1/3） */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, calc((100% - 16px) / 3))', // 各列=全体の1/3
            gap: 8,
            width: '100%',
            maxWidth: '100%',        // 親の幅いっぱい
            margin: '0 auto',        // 中央寄せ（親が狭い場合に備え）
          }}
        >
          {[
            { href: '/account/security', label: 'MFA設定', Icon: Shield },
            { href: '/account/tokens',   label: 'デバイス', Icon: Monitor },
            { href: '/settings',         label: '設定', Icon: Settings },
          ].map(({ href, label, Icon }) => (
            <a
              key={href}
              href={href}
              className="btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',      // 上下中央
                justifyContent: 'center',  // 左右中央
                gap: 6,
                height: 44,                // 任意の統一高さ
                width: '100%',             // その列幅いっぱい＝1/3
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
            >
              <Icon size={16} />
              {label}
            </a>
          ))}
        </div>

        <hr style={{ margin:'6px 0' }} />

        {/* 最下段：ログアウト（横いっぱい） */}
        <div>
          <button className="btn" style={{ width:'100%', justifyContent:'center' }} onClick={logout}>
            <LogOut size={16} style={{ marginRight:6 }} /> ログアウト
          </button>
        </div>
      </section>
    </main>
  );
}
