// src/lib/sync-settings.ts
import { useEffect, useState } from 'react';

export type SyncSettings = {
  baseUrl: string; // 例: https://<origin>/api/sync
  token: string;
  userId: string | null;
};

const LS_KEY = 'hk.sync';

const DEFAULTS: SyncSettings = {
  baseUrl: '',
  token: '',
  userId: null,
};

export function loadSyncSettings(): SyncSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function saveSyncSettings(patch: Partial<SyncSettings>): SyncSettings {
  const next = { ...loadSyncSettings(), ...patch };
  if (typeof window !== 'undefined') {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  }
  return next;
}

export function computeDefaultBaseUrl() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/api/sync`;
}

export function ensureSyncBaseUrlUpToDate() {
  if (typeof window === 'undefined') return;
  const expected = computeDefaultBaseUrl();
  const cur = loadSyncSettings();
  if (cur.baseUrl !== expected) saveSyncSettings({ baseUrl: expected });
}

/** UI 用：表示が最新になるように自動リフレッシュ */
export function useSyncSettings() {
  const [settings, setSettings] = useState<SyncSettings>(DEFAULTS);

  useEffect(() => {
    // 1) 現在の接続URLで自動更新
    ensureSyncBaseUrlUpToDate();
    // 2) 直後にロード
    setSettings(loadSyncSettings());

    // 3) 他タブ/ページ変更で更新されたら追従
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY) setSettings(loadSyncSettings());
    };
    const onVis = () => setSettings(loadSyncSettings());

    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const update = (patch: Partial<SyncSettings>) => setSettings(saveSyncSettings(patch));

  const refresh = () => setSettings(loadSyncSettings());

  return { settings, update, refresh };
}
