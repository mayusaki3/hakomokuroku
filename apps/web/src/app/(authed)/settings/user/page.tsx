// スクショ準拠のUIを維持しつつ、/settings/user 用の単一ページ。
// 役割: 表示 → /api/auth/me の結果で初期化。更新 → /api/user/profile, /api/user/icon を叩く。
// ポイント:
// - 送信中はボタン無効化し「送信中」表示のまま遷移させない（登録時の違和感を回避）
// - 更新成功時に 'me:updated' を window.dispatchEvent してヘッダーが再取得できるようにする
"use client";

import { useEffect, useState, useCallback } from 'react';

type Me = { id: string; userId: string; userName: string | null; iconDataUrl: string | null };

export default function SettingsUserPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [userName, setUserName] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [busy, setBusy] = useState(false);
  const [iconPreview, setIconPreview] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    const r = await fetch(`/api/auth/me?cb=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) { setMe(null); return; }
    const j = await r.json();
    const m: Me = j.me;
    setMe(m);
    setUserName(m.userName ?? '');
    setIconPreview(m.iconDataUrl ?? null);
  }, []);

  useEffect(() => {
    loadMe();
    // ヘッダー等からの更新通知で再読込
    const onUpdated = () => loadMe();
    window.addEventListener('me:updated', onUpdated);
    return () => window.removeEventListener('me:updated', onUpdated);
  }, [loadMe]);

  const onChangeIcon = async (file: File) => {
    const buf = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const dataUrl = `data:${file.type};base64,${b64}`;
    setBusy(true);
    try {
      const r = await fetch('/api/user/icon', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iconDataUrl: dataUrl }),
      });
      if (r.ok) {
        setIconPreview(dataUrl);
        window.dispatchEvent(new Event('me:updated')); // ヘッダー再読込
      }
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName, deviceName }),
      });
      if (r.ok) {
        window.dispatchEvent(new Event('me:updated')); // ヘッダー再読込
      }
    } finally {
      setBusy(false);
    }
  };

  if (!me) {
    return <div className="p-4">ユーザー情報の取得に失敗しました。</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">ユーザー情報</h1>

      {/* アイコンとID行 */}
      <div className="flex items-center gap-4">
        <img
          src={iconPreview ?? '/icons/user-default.svg'}
          alt="icon"
          className="w-16 h-16 rounded-full object-cover border"
        />
        <div className="text-sm">ID：<span className="font-mono">{me.userId}</span></div>

        <label className="ml-4">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onChangeIcon(f); }}
            disabled={busy}
          />
          <span className="btn">画像選択</span>
        </label>
      </div>

      {/* フォーム */}
      <div className="space-y-3 max-w-xl">
        <div>
          <label className="block text-sm mb-1">ユーザー名</label>
          <input
            className="w-full input"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            disabled={busy}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">デバイス名</label>
          <input
            className="w-full input"
            placeholder="未設定"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="pt-2">
          <button className="btn-primary" onClick={onSave} disabled={busy}>
            {busy ? '送信中' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
