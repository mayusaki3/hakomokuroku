// apps/web/src/app/settings/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, SlidersHorizontal } from 'lucide-react';
import { useSettings } from '@/lib/settings';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 12 }}>
      <h2 style={{ margin: '4px 0 8px', fontSize: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

type ThemeLite = { id: string; name: string };
type VisionState = { provider: 'none'|'openai'|'claude'|'gemini' };

export default function SettingsHomePage() {
  const { settings: s, update } = useSettings();

  // ===== テーマ一覧（/api 経由） =====
  const [themes, setThemes] = useState<ThemeLite[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/settings/theme/list', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        setThemes(j.themes as ThemeLite[]);
      }
      // 選択中IDはローカル保持（必要ならサーバ保持に変更可）
      const aid = localStorage.getItem('hk.themeActiveId') || '';
      setActiveId(aid);
      // 初期表示時に現在のテーマを適用
      await loadAndApplyTheme(aid);
    })();
  }, []);

  const onChangeActive = async (id: string) => {
    setActiveId(id);
    localStorage.setItem('hk.themeActiveId', id);
    await loadAndApplyTheme(id);
    // サーバの「現在のテーマ」を更新（他端末用）
    const vars = id ? (await fetch(`/api/settings/theme/get?id=${encodeURIComponent(id)}`, {cache:'no-store'}).then(r=>r.json()).then(j=>j?.theme?.vars||{})) : {};
    await fetch('/api/settings/theme/activate', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ id, vars })
    });
    // 他タブへ通知
    window.dispatchEvent(new Event('hk-theme-updated'));
  };

  // ===== テーマ適用ユーティリティ =====
  function persistActiveTheme(vars: Record<string, string> | null, id?: string) {
    try {
      if (vars && Object.keys(vars).length > 0) {
        // 壁紙は url() で包む（未包時のみ）
        const v = { ...vars };
        const k = 'hk-wallpaper-image';
        if (typeof v[k] === 'string') {
          const raw = String(v[k] || '').trim();
          v[k] = raw ? (raw.startsWith('url(') ? raw : `url(${raw})`) : 'none';
        }
        localStorage.setItem('hk.themeActiveVars', JSON.stringify(v));
      } else {
        // デフォルトへ戻す: 永続データを消し、<html> の hk系CSS変数も即時クリア
        localStorage.removeItem('hk.themeActiveVars');
        clearThemeVars();
      }
      if (id !== undefined) localStorage.setItem('hk.themeActiveId', id);
      // layout 側の ThemeRuntimeApplier がこのイベントを監視して適用する
      window.dispatchEvent(new Event('hk-theme-updated'));
      // サーバへ反映（id 未指定やデフォルトは空扱い）
      void fetch('/api/settings/theme/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id || '', vars })
      });
    } catch { /* no-op */ }
  }

  // <html> に残った hk系の CSS 変数を即時クリア
  function clearThemeVars() {
    const root = document.documentElement;
    const keys = [
      'hk-wallpaper-image','hk-wallpaper-color','hk-content-bg',
      'hk-header-image','hk-header-fg',
      'hk-toolbar-bg','hk-toolbar-fg',
      'hk-input-bg','hk-input-fg','hk-input-border',
      'hk-btn-bg','hk-btn-fg','hk-btn-border'
    ];
    for (const k of keys) root.style.removeProperty(`--${k}`);
    // 壁紙は none を明示（CSSのフォールバックが効くようにする）
    root.style.setProperty('--hk-wallpaper-image', 'none');
  }

  async function loadAndApplyTheme(id: string) {
    if (!id) { persistActiveTheme(null, ''); return; } // デフォルトへ戻す
    try {
      const r = await fetch(`/api/settings/theme/get?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!r.ok) { persistActiveTheme(null, id); return; }
      const j = await r.json();
      const vars = (j?.theme?.vars ?? {}) as Record<string, string>;
      persistActiveTheme(vars, id);
    } catch {
      persistActiveTheme(null, id);
    }
  }

  // ===== 画像認識（表示用の現在値）=====
  const [vision, setVision] = useState<VisionState>({ provider: 'none' });
  const providerLabel = useMemo(() => {
    switch (vision.provider) {
      case 'openai': return 'OpenAI';
      case 'claude': return 'Claude';
      case 'gemini': return 'Gemini';
      default: return 'なし';
    }
  }, [vision.provider]);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/settings/vision/get', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        setVision({ provider: (j?.provider ?? 'none') });
      }
    })();
  }, []);

  const disableVision = async () => {
    const r = await fetch('/api/settings/vision/disable', { method: 'POST' });
    if (r.ok) setVision({ provider: 'none' });
  };

  return (
    <main className="container bottom-safe" style={{ display:'grid', gap:12, paddingTop:8 }}>
      {/* 表示 → テーマ選択/追加/編集 */}
      <Section title="表示">
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:8, alignItems:'center' }}>
          <div style={{ fontWeight: 600 }}>テーマ選択</div>
          <select
            value={activeId}
            onChange={(e)=>void onChangeActive(e.target.value)}
            style={{ minWidth:220, padding:'6px 8px', border:'1px solid var(--hk-border)', borderRadius:6 }}
          >
            <option value="">（デフォルト）</option>
            {themes.map(t=>(
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <div style={{ display:'flex', gap:8 }}>
            <Link href="/settings/theme?mode=new" className="btn" title="テーマを追加">
              <Plus size={16} style={{ marginRight:6 }} /> 追加
            </Link>
            <Link
              href={`/settings/theme${activeId ? `?id=${encodeURIComponent(activeId)}` : ''}`}
              className="btn"
              title="選択中のテーマを編集"
            >
              <Pencil size={16} style={{ marginRight:6 }} /> 編集
            </Link>
          </div>
        </div>
      </Section>

      {/* 画像認識 */}
      <Section title="画像認識">
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:8, alignItems:'center' }}>
          <div><strong>連携LLM:</strong> {providerLabel}</div>
          <Link href="/settings/vision" className="btn" title="設定">
            <SlidersHorizontal size={16} style={{ marginRight:6 }} /> 設定
          </Link>
          <button className="btn" onClick={disableVision}>無効化</button>
        </div>
      </Section>

      {/* 以下は元ページの他セクション：必要なら残す/調整 */}
      <Section title="スキャン">
        <label className="row" style={{ alignItems:'center' }}>
          <input type="checkbox" checked={s.preferBackCamera} onChange={e=>update('preferBackCamera', e.target.checked)} />
          背面カメラを優先する
        </label>
        <label className="row" style={{ alignItems:'center', marginTop:6 }}>
          <input type="checkbox" checked={s.scanBeep} onChange={e=>update('scanBeep', e.target.checked)} />
          読み取り時に音/バイブ
        </label>
      </Section>

      <Section title="検索/絞り込み">
        <label className="row" style={{ alignItems:'center' }}>
          <input type="checkbox" checked={s.keepFiltersOnNav} onChange={e=>update('keepFiltersOnNav', e.target.checked)} />
          ルーティング時に絞り込み（q/qr）を引き継ぐ
        </label>
        <div className="row" style={{ alignItems:'center', marginTop:8 }}>
          <label style={{ minWidth: 120 }}>既定の並び順</label>
          <select value={s.sortDefault} onChange={e=>update('sortDefault', e.target.value as any)}>
            <option value="updatedDesc">更新日時（新しい順）</option>
            <option value="nameAsc">名前（昇順）</option>
          </select>
        </div>
      </Section>

      <Section title="ラベル/QR 表示">
        <p className="search-help" style={{ marginTop: 6 }}>
          選択内容の登録・出力は別ページで行います。
        </p>
        <div style={{ marginTop:8 }}>
          <Link href="/labels" className="btn-link">ラベル出力ページへ</Link>
        </div>
      </Section>

      <Section title="バックアップ/リストア">
        <div>
          <Link href="/settings/backup" className="btn-link">全データのバックアップ/リストアへ</Link>
        </div>
      </Section>
    </main>
  );
}
