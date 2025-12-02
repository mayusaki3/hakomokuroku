'use client';
import { useEffect } from 'react';

export default function ThemeRuntimeApplier() {
  useEffect(() => {
    const root = document.documentElement;

    const clearTheme = () => {
      // CSS変数を即時クリア
      const keys = [
        'hk-wallpaper-image',
        'hk-wallpaper-color',
        'hk-content-bg',
        'hk-header-image',
        'hk-header-fg',
        'hk-toolbar-bg',
        'hk-toolbar-fg',
        'hk-input-bg',
        'hk-input-fg',
        'hk-input-border',
        'hk-btn-bg',
        'hk-btn-fg',
        'hk-btn-border',
      ];
      for (const k of keys) root.style.removeProperty(`--${k}`);
      root.style.setProperty('--hk-wallpaper-image', 'none');
      // ローカル状態も初期化
      localStorage.removeItem('hk.themeActiveVars');
      localStorage.setItem('hk.themeActiveId', '');
    };

    const setVars = (vars: Record<string, string> | null | undefined) => {
      if (!vars) return;
      root.style.removeProperty('--hk-wallpaper-image');
      for (const [k, v] of Object.entries(vars)) {
        const val = String(v ?? '');
        if (k === 'hk-wallpaper-image') {
          root.style.setProperty(
            '--hk-wallpaper-image',
            val ? (val.startsWith('url(') ? val : `url(${val})`) : 'none'
          );
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
      } catch {
        return null;
      }
    };

    const loadFromServer = async () => {
      try {
        const r = await fetch('/api/settings/theme/active', { cache: 'no-store' });
        if (r.status === 401) {
          clearTheme();
          return;
        } // 未ログイン→デフォルト
        if (!r.ok) return;

        const j = await r.json(); // { id, vars }
        setVars(j?.vars || {});
      } catch {
        /* no-op */
      }
    };

    // 空IDは即デフォルト化。そうでなければローカル→サーバの順に適用
    const aid = localStorage.getItem('hk.themeActiveId') || '';
    if (aid === '') {
      clearTheme();
    } else {
      loadFromLocal();
    }
    void loadFromServer();

    const onUpdate = () => {
      loadFromLocal();
      void loadFromServer();
    };
    window.addEventListener('hk-theme-updated', onUpdate);
    window.addEventListener('hk:logout', onUpdate);
    window.addEventListener('storage', onUpdate);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void loadFromServer();
    });

    return () => {
      window.removeEventListener('hk-theme-updated', onUpdate);
      window.removeEventListener('storage', onUpdate);
      window.removeEventListener('hk:logout', onUpdate);
    };
  }, []);

  return null;
}
