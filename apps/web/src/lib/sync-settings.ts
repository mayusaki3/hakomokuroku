// apps/web/src/lib/sync-settings.ts
export type SyncSettings = {
  endpoint: string; // 例: https://xxx.example.com/api/sync
  token: string;    // Bearer トークン
};

const KEY = 'hk.sync.settings';

export function loadSyncSettings(): SyncSettings {
  // SSR では保存しない
  if (typeof window === 'undefined') return { endpoint: '', token: '' };

  const raw = localStorage.getItem(KEY);
  let s: SyncSettings = raw ? JSON.parse(raw) : { endpoint: '', token: '' };

  // endpoint が未設定なら、現在アクセス中のオリジンを使って自動設定
  if (!s.endpoint) {
    const origin = window.location.origin; // トンネル・リバプロ経由の外向きURL
    s.endpoint = `${origin}/api/sync`;
    localStorage.setItem(KEY, JSON.stringify(s));
  }
  return s;
}

export function saveSyncSettings(s: SyncSettings) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(s));
  }
}
