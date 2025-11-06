// apps/web/src/app/(authed)/settings/user/page.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera, Image as ImageIcon, RotateCwSquare, Pencil, Check, X,
  Shield, Monitor, Settings as SettingsIcon, LogOut
} from 'lucide-react';
import { mutate as globalMutate } from 'swr';

// 現行APIの user 形
type Me = {
  id: string;
  userId: string;
  userName: string | null;
  iconDataUrl: string | null;
  totpEnabled: boolean;
};

export default function SettingsUserPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const loadMe = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me?cb=' + Date.now(), {
        cache:'no-store',
        credentials:'include',
        headers:{ accept:'application/json' }
      });
      if (!r.ok) return handleUnauthed();
      const body = await r.json().catch(() => ({} as any));

      // /api/auth/me が {ok:true, user:{...}} か {ok:true, me:{...}} の両対応
      const u: Me | null = (body && (body.user ?? body.me)) ?? null;
      if (!u) return handleUnauthed();

      setMe(u);
      setUserNameDraft(u.userName ?? '');
      setIconPreview(u.iconDataUrl ?? null);
      
      // 端末ラベル（トークン名）
      try {
        const cur = JSON.parse(localStorage.getItem('hk.sync') || '{}');
        const token: string = cur?.token || '';
        if (!token) return;
        const enc = new TextEncoder().encode(token);
        const h = await crypto.subtle.digest('SHA-256', enc);
        const hash = Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');
        const rt = await fetch('/api/auth/tokens', { cache:'no-store', credentials:'include' });
        if (!rt.ok) return;
        const jt = await rt.json();
        const self = (jt.tokens || []).find((t: any) => t.tokenHash === hash);
        const name = self?.deviceName ?? '';
        setDeviceName(name);
        setDeviceNameDraft(name);
      } catch {}
    } catch {
      handleUnauthed();
    }
  }, []);

  function handleUnauthed() {
    try { localStorage.removeItem('hk.sync'); } catch {}
    document.cookie = 'hk_token=; Path=/; Max-Age=0; SameSite=Lax';

    const u = new URL(location.href);
    // 既に誘導先に居るなら、リダイレクトせずに未ログイン表示へ切り替え
    if (u.pathname === '/settings/user' && u.searchParams.get('login') === '1') {
      setUnauth(true);   // ★ここで確実に表示を下ろす
      return;
    }
    // まだなら誘導（既存運用に合わせて一本化）
    location.replace('/settings/user?login=1');
  }

  // ログイン状態
  const [unauth, setUnauth] = useState(false);

  // ユーザー名編集
  const [editingUserName, setEditingUserName] = useState(false);
  const [userNameDraft, setUserNameDraft] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  // デバイス名（ローカル連携）
  const [deviceName, setDeviceName] = useState('');
  const [deviceNameDraft, setDeviceNameDraft] = useState('');
  const [editingDeviceName, setEditingDeviceName] = useState(false);
  const [savingDevice, setSavingDevice] = useState(false);

  // アイコン入力ref
  const fileRefCamera = useRef<HTMLInputElement>(null);
  const fileRefPicker  = useRef<HTMLInputElement>(null);
  
  // 初期ロード：/api/settings/user から取得（{ok,user}）
  useEffect(() => { loadMe(); }, [loadMe]);

  // 画像送信：現行は PUT JSON {iconDataUrl}
  async function uploadIconDataUrl(dataUrl: string) {
    const r = await fetch('/api/user/icon', {
      method:'PUT',
      credentials:'include',
      headers:{ 'content-type':'application/json', accept:'application/json' },
      body: JSON.stringify({ iconDataUrl: dataUrl, dataUrl }),
    });
    if (r.status === 401) return handleUnauthed();
    // サーバが何も返さないケースに備え、jsonは必須にしない
    try { await r.json(); } catch {}
    if (!r.ok) {
      // 失敗時は軽い通知だけ出してプレビューは残す（ユーザーに保存失敗を知らせる）
      console.error('icon upload failed', r.status);
      alert('アイコンの保存に失敗しました。（サーバーエラー）');
      return;
    }
    // 自画面（ローカル状態）を即時更新
    setMe(m => m ? ({ ...m, iconDataUrl: dataUrl }) : m);
    setIconPreview(prev => prev ?? dataUrl);
    // SWRキャッシュを「再フェッチなし」で上書き（ヘッダー即反映）
    await globalMutate('/api/auth/me', (prev: any) => {
      if (!prev?.ok) return { ok: true, user: { ...(me ?? {}), iconDataUrl: dataUrl } };
      return { ...prev, user: { ...prev.user, iconDataUrl: dataUrl } };
    }, false);
    await globalMutate('/api/settings/user', (prev: any) => {
      if (!prev?.user) return { user: { ...(me ?? {}), iconDataUrl: dataUrl } };
      return { ...prev, user: { ...prev.user, iconDataUrl: dataUrl } };
    }, false);
    // Header.tsx が購読しているイベントで念押し更新
    window.dispatchEvent(new Event('hk:me:changed'));
  }
  // DataURLへ変換してからPUT
  async function uploadIcon(file: File) {
    // File → <img> → Canvas → 256x256 PNG DataURL
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = (e) => rej(e as any);
      img.src = blobUrl;
    });

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    URL.revokeObjectURL(blobUrl);

    const dataUrl = canvas.toDataURL('image/png', 0.92); // PNGに統一
    setIconPreview(dataUrl);           // 楽観プレビュー
    await uploadIconDataUrl(dataUrl);  // サーバ保存
  }

  // 回転→256x256で書き出して送信
  async function rotateIcon90() {
    // 未設定（プレビューもDBも無い）なら何もしない
    if (!iconPreview && !me?.iconDataUrl) return;
    const src = iconPreview || me!.iconDataUrl!;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0,0,size,size);
      ctx.translate(size/2, size/2);
      ctx.rotate(90 * Math.PI / 180);
      ctx.drawImage(img, -size/2, -size/2, size, size);
      const dataUrl = canvas.toDataURL('image/png', 0.92);  // 直接 DataURL を得る
      setIconPreview(dataUrl);                               // 即プレビュー更新
      await uploadIconDataUrl(dataUrl);                      // サーバ保存
    };
    img.onerror = () => {};
    img.src = src;
  }

  // ユーザー名保存：現行は /api/user/profile に PUT JSON
  async function saveUserName() {
    setSavingUser(true);
    const r = await fetch('/api/user/profile', {
      method:'PUT',
      credentials:'include',
      headers:{ 'content-type':'application/json', accept:'application/json' },
      body: JSON.stringify({ userName: userNameDraft }),
    });
    setSavingUser(false);
    if (r.status === 401) return handleUnauthed();
    if (r.ok) {
      const j = await r.json().catch(()=>({}));
      setMe(m => m ? ({ ...m, userName: j.userName ?? userNameDraft }) : m);
      setEditingUserName(false);
      window.dispatchEvent(new Event('hk:me:changed'));
    }
  }

  // デバイス名保存：旧APIのまま（/api/auth/tokens/label）
  async function saveDeviceName() {
    setSavingDevice(true);
    const r = await fetch('/api/auth/tokens/label', {
      method:'POST',
      credentials:'include',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ deviceName: deviceNameDraft }),
    });
    setSavingDevice(false);
    if (r.status === 401) return handleUnauthed();
    if (r.ok) { setDeviceName(deviceNameDraft); setEditingDeviceName(false); }
  }

  async function logout() {
    // 1) サーバ側セッション終了（POSTのみ）
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.error('logout post failed:', e);
    }

    // 2) クライアント側の状態クリア（ローカルとCSS変数）
    try {
      localStorage.removeItem('hk.sync');
      localStorage.removeItem('hk.themeActiveVars');
      localStorage.setItem('hk.themeActiveId', '');
    } catch {}
    const root = document.documentElement;
    const keys = [
      'hk-wallpaper-image','hk-wallpaper-color','hk-content-bg',
      'hk-header-image','hk-header-fg',
      'hk-toolbar-bg','hk-toolbar-fg',
      'hk-input-bg','hk-input-fg','hk-input-border',
      'hk-btn-bg','hk-btn-fg','hk-btn-border'
    ];
    for (const k of keys) root.style.removeProperty(`--${k}`);
    root.style.setProperty('--hk-wallpaper-image', 'none');
    window.dispatchEvent(new Event('hk-theme-updated'));

    // 3) SWRキャッシュを未ログインへ即時反映（ヘッダー反映を速くする）
    await globalMutate('/api/auth/me', { ok: false, user: null }, false);
    await globalMutate('/api/settings/user', { user: null }, false);
    window.dispatchEvent(new Event('hk:logged-out'));

    // 4) 404 の /login を使わず、運用済みの誘導先へ
    location.replace('/settings/user?login=1');
  } 

  // 1) 未ログインUIを最優先で降ろす
  if (unauth) {
    return (
      <main className="container">
        <h2>ユーザー情報</h2>
        <p>ログインが必要です。右上のユーザーアイコンからログインしてください。</p>
      </main>
    );
  }

  // 2) ユーザー情報未取得中
  if (!me) return <main className="container">Loading...</main>;

  return (
    <div className="app-content content-edge-6">
      <div className="app-scroll">
        <section className="hk-frame">
          <h2 style={{ margin:'2px 0 8px' }}>ユーザー情報</h2>

          <hr className="hk-frame__hr" />

          {/* 上段：左アイコン／右：ID と 操作ボタン */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              columnGap: 12,
              alignItems: 'center',
            }}
          >
            {/* 左：アイコン（96×96・丸・object-fit） */}
            <div>
              <img
                src={iconPreview || me.iconDataUrl || '/icons/user-default.svg'}
                alt="user"
                width={96}
                height={96}
                className="rounded-full"
                style={{ objectFit: 'cover' }}
                onError={(e)=>{ (e.currentTarget as HTMLImageElement).src = '/icons/user-default.svg'; }}
              />
            </div>

            {/* 右：ID行 と 操作ボタン行 */}
            <div
              style={{
                display: 'grid',
                gridTemplateRows: 'auto auto',
                rowGap: 8,
                alignItems: 'center',
              }}
            >
              {/* ID */}
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'nowrap', justifyContent:'flex-start' }}>
                <span style={{ minWidth:30, whiteSpace:'nowrap' }}>ID :</span>
                <div style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  <b>{me.userId}</b>
                </div>
              </div>

              {/* カメラ／画像／回転 */}
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

          <hr className="hk-frame__hr" />

          {/* 中段：ユーザー名（編集↔保存/キャンセル） */}
          <div className="form-row">
            <span className="form-label">ユーザー名</span>
            <input
              value={userNameDraft}
              onChange={e=>setUserNameDraft(e.target.value)}
              maxLength={50}
              readOnly={!editingUserName}
              aria-readonly={!editingUserName}
              className={`form-input ${!editingUserName ? 'opacity-70 pointer-events-none' : ''}`}
              onKeyDown={(e)=>{ if (!editingUserName) return; if (e.key==='Enter') saveUserName(); if (e.key==='Escape'){ setUserNameDraft(me.userName ?? ''); setEditingUserName(false);} }}
            />
            {!editingUserName ? (
              <button className="btn form-actions" aria-label="編集" onClick={()=>setEditingUserName(true)}><Pencil size={16} /></button>
            ) : (
              <div className="form-actions">
                <button className="btn btn-primary" aria-label="保存" disabled={savingUser || !editingUserName} onClick={saveUserName}><Check size={16} /></button>
                <button className="btn" aria-label="キャンセル" onClick={()=>{ setUserNameDraft(me.userName ?? ''); setEditingUserName(false); }}><X size={16} /></button>
              </div>
            )}
          </div>

          {/* 中段：デバイス名（ローカル管理のまま） */}
          <div className="form-row" style={{ marginTop:8 }}>
            <span className="form-label">デバイス名</span>
            <input
              value={deviceNameDraft}
              onChange={e=>setDeviceNameDraft(e.target.value)}
              maxLength={80}
              readOnly={!editingDeviceName}
              aria-readonly={!editingDeviceName}
              className={`form-input ${!editingDeviceName ? 'opacity-70 pointer-events-none' : ''}`}
              placeholder={deviceName ? '' : '未設定'}
              onKeyDown={(e)=>{ if (!editingDeviceName) return; if (e.key==='Enter') saveDeviceName(); if (e.key==='Escape'){ setDeviceNameDraft(deviceName); setEditingDeviceName(false);} }}
            />
            {!editingDeviceName ? (
              <button className="btn form-actions" aria-label="編集" onClick={()=>setEditingDeviceName(true)}><Pencil size={16} /></button>
            ) : (
              <div className="form-actions">
                <button className="btn btn-primary" aria-label="保存" disabled={savingDevice || !editingDeviceName} onClick={saveDeviceName}><Check size={16} /></button>
                <button className="btn" aria-label="キャンセル" onClick={()=>{ setDeviceNameDraft(deviceName); setEditingDeviceName(false); }}><X size={16} /></button>
              </div>
            )}
          </div>

          <hr className="hk-frame__hr" />

          {/* 下段：MFA / デバイス / 設定 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 8,
              width: '100%',
              maxWidth: '100%',
              margin: '0 auto',
            }}
          >
            {[
              { href: '/settings/mfa', label: 'MFA設定', Icon: Shield },
              { href: '/settings/device', label: 'デバイス', Icon: Monitor },
              { href: '/settings', label: '設定', Icon: SettingsIcon },
            ].map(({ href, label, Icon }) => (
              <a
                key={href}
                href={href}
                className="btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 44,
                  width: '100%',
                  minWidth: 0,
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

          <hr className="hk-frame__hr" />

          {/* 最下段：ログアウト（横いっぱい） */}
          <div>
            <button className="btn" style={{ width:'100%', justifyContent:'center' }} onClick={logout}>
              <LogOut size={16} style={{ marginRight:6 }} /> ログアウト
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
