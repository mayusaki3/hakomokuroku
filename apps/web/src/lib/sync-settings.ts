// apps/web/src/lib/sync-settings.ts
export type SyncSettings = {
  token: string;              // Bearer トークンのみ保存
};

const KEY = 'hk.sync.settings';

// 常に現在オリジンから解決
export function resolveEndpoint(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/api/sync`;
}

export function loadSyncSettings(): { token: string; endpoint: string } {
  if (typeof window === 'undefined') return { token: '', endpoint: '' };
  const raw = localStorage.getItem(KEY);
  const s: SyncSettings = raw ? JSON.parse(raw) : { token: '' };
  return { token: s.token || '', endpoint: resolveEndpoint() };
}

export function saveToken(token: string) {
  if (typeof window === 'undefined') return;
  const payload: SyncSettings = { token };
  localStorage.setItem(KEY, JSON.stringify(payload));
}
