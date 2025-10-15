'use client';

import { useEffect } from 'react';

export default function TokenMirror() {
  useEffect(() => {
    const sync = () => {
      try {
        const raw = localStorage.getItem('hk.sync');
        const token = raw ? (JSON.parse(raw)?.token as string | undefined) : undefined;
        if (token && token.length > 0) {
          // Lax で十分。API は Authorization ヘッダを使用
          document.cookie = `hk_token=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
        } else {
          document.cookie = 'hk_token=; Path=/; Max-Age=0; SameSite=Lax';
        }
      } catch {
        document.cookie = 'hk_token=; Path=/; Max-Age=0; SameSite=Lax';
      }
    };
    sync();
    // 他タブでの変更も拾う
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'hk.sync') sync();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return null;
}
