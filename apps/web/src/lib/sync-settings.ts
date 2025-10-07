// apps/web/src/lib/sync-settings.ts
export type SyncSettings = {
  endpoint: string; // 例: http://localhost:3000/api/sync
  token: string;    // Bearer の中身
};

const KEY = 'hk.sync.settings';

export function loadSyncSettings(): SyncSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { endpoint: '', token: '' };
    const obj = JSON.parse(raw);
    return {
      endpoint: obj.endpoint ?? '',
      token: obj.token ?? '',
    };
  } catch {
    return { endpoint: '', token: '' };
  }
}

export function saveSyncSettings(v: SyncSettings) {
  localStorage.setItem(KEY, JSON.stringify({
    endpoint: (v.endpoint ?? '').trim(),
    token: (v.token ?? '').trim(),
  }));
}
