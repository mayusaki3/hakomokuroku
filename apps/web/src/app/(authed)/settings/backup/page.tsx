'use client';

import { useEffect, useState, useMemo } from 'react';
import { loadSyncSettings, saveSyncSettings } from '@/lib/sync-settings';
import { pullFromServer, pushToServer } from '@/lib/sync';
import { useSyncSettings, computeDefaultBaseUrl } from '@/lib/sync-settings';

export default function BackupSettingsPage() {
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'idle' | 'pull' | 'push' | 'save'>('idle');
  const [msg, setMsg] = useState<string>('');
  const { settings, update, refresh } = useSyncSettings();
  const computed = computeDefaultBaseUrl();

  // 初期値読込
  useEffect(() => {
    const s = loadSyncSettings();
    setEndpoint(s.endpoint || computed);
    setToken(s.token || '');
  }, []);

  const canSync = useMemo(() => !!endpoint && !!token, [endpoint, token]);

  const onSave = async () => {
    setBusy('save');
    setMsg('');
    saveSyncSettings({ endpoint, token });
    setBusy('idle');
    setMsg('保存しました');
  };

  const onPull = async () => {
    setBusy('pull');
    setMsg('');
    try {
      const res = await pullFromServer();
      setMsg(`PULL 成功: boxes=${res.boxes}, items=${res.items}, locations=${res.locations}`);
    } catch (e: any) {
      setMsg(`PULL 失敗: ${e?.message ?? e}`);
    } finally {
      setBusy('idle');
    }
  };

  const onPush = async () => {
    setBusy('push');
    setMsg('');
    try {
      const res = await pushToServer();
      setMsg(`PUSH 成功: boxes=${res.boxes}, items=${res.items}, locations=${res.locations}`);
    } catch (e: any) {
      setMsg(`PUSH 失敗: ${e?.message ?? e}`);
    } finally {
      setBusy('idle');
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '12px' }}>
      <h2 style={{ marginBottom: 8 }}>同期設定</h2>

      <label className="form-label">エンドポイント（/api/sync）</label>
      <input
        className="input"
        placeholder="http://localhost:3000/api/sync"
        value={endpoint}
        onChange={(e) => setEndpoint(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />

      <label className="form-label">トークン（Bearer）</label>
      <input
        className="input"
        placeholder="例: wODSXM4OMTivH3E7"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={onSave} disabled={busy !== 'idle'}>
          保存
        </button>
        <button className="btn" onClick={onPull} disabled={!canSync || busy !== 'idle'}>
          PULL
        </button>
        <button className="btn" onClick={onPush} disabled={!canSync || busy !== 'idle'}>
          PUSH
        </button>
      </div>

      {msg && (
        <div className="note" role="status" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
          {msg}
        </div>
      )}

      <hr style={{ margin: '16px 0' }} />

      <p style={{ color: '#666', fontSize: 13 }}>
        ※ トークンはブラウザの localStorage に保存されます（この端末のみ）。サーバ側の{' '}
        <code>.env</code> の <code>SYNC_TOKEN</code> と一致している必要があります。
        <br />※ Pull は <code>?since=最後Pull時刻</code> で差分取得、Push は <code>updatedAt</code>{' '}
        基準で差分送信します。
      </p>
    </div>
  );
}
