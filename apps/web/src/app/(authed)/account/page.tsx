// apps/web/src/app/(authed)/account/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';

function handle401() {
  try { localStorage.removeItem('hk.sync'); } catch {}
  document.cookie = 'hk_token=; Path=/; Max-Age=0; SameSite=Lax';
  location.replace('/auth');
}

type Me = {
  userId: string;
  userName?: string | null;
  iconDataUrl?: string | null;
  totpEnabled: boolean;
  recoveryCount: number;
};

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [syncToken, setSyncToken] = useState('');
  const [editName, setEditName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const r = await fetch('/api/auth/me', { cache: 'no-store', headers: { accept: 'application/json' } });
    if (r.status === 401) return handle401();
    const j: Me = await r.json();
    setMe(j);
    setEditName(j.userName ?? '');
    try {
      const cur = JSON.parse(localStorage.getItem('hk.sync') || '{}');
      setSyncToken(cur?.token || '');
    } catch {}
  }
  useEffect(() => { refresh(); }, []);

  async function uploadIcon(file: File) {
    const r = await fetch('/api/account/icon', {
      method: 'POST',
      body: await file.arrayBuffer(),
      headers: { 'content-type': file.type || 'application/octet-stream' },
    });
    if (r.status === 401) return handle401();
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      setMe(m => (m ? { ...m, iconDataUrl: j.iconDataUrl } : m));
      window.dispatchEvent(new Event('hk:me:changed'));
    }
  }

  async function saveName() {
    setSaving(true);
    const r = await fetch('/api/account/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userName: editName }),
    });
    setSaving(false);
    if (r.status === 401) return handle401();
    if (r.ok) {
      const j = await r.json();
      setMe(m => (m ? { ...m, userName: j.userName } : m));
      window.dispatchEvent(new Event('hk:me:changed'));
    }
  }
  async function onSaveName() { await saveName(); setEditingName(false); }
  function onCancelName() { setEditName(me?.userName ?? ''); setEditingName(false); }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    try { localStorage.removeItem('hk.sync'); } catch {}
    document.cookie = 'hk_token=; Path=/; Max-Age=0; SameSite=Lax';
    location.href = '/auth';
  }

  async function deleteAccount() {
    if (!confirm('ユーザー情報を削除します。復元できません。続行しますか？')) return;
    const pw = prompt('確認のためパスワードを入力してください'); if (!pw) return;
    const r = await fetch('/api/auth/account/delete', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (r.status === 401) return handle401();
    if (r.ok) await logout();
  }

  if (!me) return <main className="container">Loading...</main>;

  return (
    <main className="container" style={{ display: 'grid', gap: 16, paddingTop: 8 }}>
      {/* ユーザー情報（ユーザー名は鉛筆で編集開始／保存・取消） */}
      <section className="card" style={{ padding: 12 }}>
        <h2 style={{ margin: '4px 0 8px' }}>ユーザー情報</h2>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <img
            src={me.iconDataUrl || '/icons/user-default.svg'}
            alt="user"
            width={64}
            height={64}
            className="rounded-full"
          />
          <div className="col" style={{ gap: 6 }}>
            <div className="text-sm">ユーザーID：<b>{me.userId}</b></div>

            <label className="row" style={{ alignItems: 'center', gap: 8, flexWrap:'nowrap' }}>
              <span style={{ minWidth: 80, whiteSpace:'nowrap' }}>ユーザー名</span>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
                readOnly={!editingName}
                aria-readonly={!editingName}
                className={!editingName ? 'opacity-70 pointer-events-none' : ''}
                style={{ flex:1, minWidth:0 }}
                onKeyDown={(e) => {
                  if (!editingName) return;
                  if (e.key === 'Enter') onSaveName();
                  if (e.key === 'Escape') onCancelName();
                }}
              />
              {!editingName ? (
                <button className="btn" aria-label="編集" onClick={() => setEditingName(true)}>
                  <Pencil size={16} />
                </button>
              ) : (
                <div className="row" style={{ gap: 6 }}>
                  <button
                    className="btn btn-primary"
                    aria-label="保存"
                    disabled={saving || (me.userName ?? '') === editName}
                    onClick={onSaveName}
                  >
                    <Check size={16} />
                  </button>
                  <button className="btn" aria-label="キャンセル" onClick={onCancelName}>
                    <X size={16} />
                  </button>
                </div>
              )}
            </label>

            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadIcon(f); }}
              />
              <button className="btn" onClick={() => fileRef.current?.click()}>アイコンを変更</button>
              <button className="btn" onClick={logout}>ログアウト</button>
            </div>
          </div>
        </div>
      </section>

      {/* 同期トークン（表示のみ） */}
      <section className="card" style={{ padding: 12 }}>
        <h2 style={{ margin: '4px 0 8px' }}>同期トークン</h2>
        <div className="text-xs text-muted-foreground">この端末の同期トークン（入力は不要／表示のみ）</div>
        <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center' }}>
          <input readOnly value={syncToken} style={{ width: '100%' }} />
          <button className="btn" onClick={() => navigator.clipboard.writeText(syncToken)}>コピー</button>
        </div>
      </section>

      {/* セキュリティ（TOTP） */}
      <section className="card" style={{ padding: 12 }}>
        <h2 style={{ margin: '4px 0 8px' }}>セキュリティ</h2>
        <div className="text-sm">二段階認証：{me.totpEnabled ? '有効' : '無効'}（回復コード残り {me.recoveryCount}）</div>
        <a className="btn mt-2" href="/account/security">設定を開く</a>
      </section>

      {/* デバイス/トークン管理は別ページ */}
      <section className="card" style={{ padding: 12 }}>
        <h2 style={{ margin: '4px 0 8px' }}>デバイス / トークン</h2>
        <a className="btn" href="/account/tokens">ログイン中デバイス / トークンを管理</a>
      </section>

      {/* 危険ゾーン */}
      <section className="card" style={{ padding: 12, borderColor: '#f00' }}>
        <h2 style={{ margin: '4px 0 8px', color: '#f00' }}>危険ゾーン</h2>
        <button
          className="btn"
          style={{ background: '#fdd', borderColor: '#f66' }}
          onClick={deleteAccount}
        >
          ユーザー情報を削除（復元不可）
        </button>
      </section>
    </main>
  );
}
