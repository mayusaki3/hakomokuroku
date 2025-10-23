'use client';
import { useEffect } from 'react';

export default function ThemeRuntimeApplier() {
  useEffect(() => {
    const root = document.documentElement;

    const setVars = (vars: Record<string, string> | null | undefined) => {
      if (!vars) return;
      root.style.removeProperty('--hk-wallpaper-image');
      for (const [k, v] of Object.entries(vars)) {
        const val = String(v ?? '');
        if (k === 'hk-wallpaper-image') {
          root.style.setProperty('--hk-wallpaper-image',
            val ? (val.startsWith('url(') ? val : `url(${val})`) : 'none');
        } else {
          root.style.setProperty(`--${k}`, val);
        }
      }
    };

    const loadFromLocal = () => {
      try {
        const s = localStorage.getItem('hk.themeActiveVars');
        if (!s) return null;
        const vars = JSON.parse(s) as Record<string, string>;
        setVars(vars);
        return vars;
      } catch { return null; }
    };

    const loadFromServer = async () => {
      try {
        const r = await fetch('/api/settings/theme/active', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();              // { id, vars }
        setVars(j?.vars || {});
      } catch { /* no-op */ }
    };

    loadFromLocal();   // まず即時にローカル適用
    void loadFromServer(); // その後サーバの最新を上書き適用

    const onUpdate = () => { loadFromLocal(); void loadFromServer(); };
    window.addEventListener('hk-theme-updated', onUpdate);
    window.addEventListener('storage', onUpdate);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void loadFromServer();
    });

    return () => {
      window.removeEventListener('hk-theme-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);

  return null;
}
