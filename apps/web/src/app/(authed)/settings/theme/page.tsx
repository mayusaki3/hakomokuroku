'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageContainer from '@/app/components/PageContainer';
import ContentFrame from '@/app/components/ContentFrame';
import { Save, X, Image as ImageIcon, Camera, Trash2 } from 'lucide-react';

type Vars = Partial<Record<string, string>>;
type ThemeDef = { id?: string; name: string; vars: Vars; wallpaperThumb?: string | null };

const VAR_KEYS = [
  // ヘッダ/ツールバー/コンテンツ/入力/ボタン
  { key: 'hk-header-image', label: 'ヘッダ背景（画像URL）', type: 'text' },
  { key: 'hk-header-fg',    label: 'ヘッダ文字色',          type: 'color' },

  { key: 'hk-toolbar-bg',   label: 'ツールバー背景色',      type: 'color' },
  { key: 'hk-toolbar-fg',   label: 'ツールバー文字色',      type: 'color' },

  { key: 'hk-content-bg',   label: 'コンテンツ背景色',      type: 'color' },

  { key: 'hk-input-bg',     label: '入力 背景色',           type: 'color' },
  { key: 'hk-input-border', label: '入力 枠線色',           type: 'color' },
  { key: 'hk-input-fg',     label: '入力 文字色',           type: 'color' },

  { key: 'hk-btn-bg',       label: 'ボタン 背景色',         type: 'color' },
  { key: 'hk-btn-border',   label: 'ボタン 枠線色',         type: 'color' },
  { key: 'hk-btn-fg',       label: 'ボタン 文字色',         type: 'color' },
];

export default function ThemeEditorPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const mode = sp.get('mode');       // 'new' | null
  const editId = sp.get('id') || '';

  const [loading, setLoading] = useState(true);
  const [t, setT] = useState<ThemeDef>({ name: '新しいテーマ', vars: {}, wallpaperThumb: null });
  const [err, setErr] = useState<string | null>(null);

  // 初期取得（編集時）
  useEffect(() => {
    (async () => {
      try {
        if (mode !== 'new' && editId) {
          const r = await fetch(`/api/settings/theme/get?id=${encodeURIComponent(editId)}`, { cache: 'no-store' });
          if (!r.ok) throw new Error('load_failed');
          const j = await r.json();
          setT({
            id: j.theme.id,
            name: j.theme.name,
            vars: j.theme.vars || {},
            wallpaperThumb: j.theme.wallpaperThumb || null,
          });
        }
        setLoading(false);
      } catch (e: any) {
        setErr('読み込みに失敗しました');
        setLoading(false);
      }
    })();
  }, [mode, editId]);

  const setVar = (key: string, val: string) => setT(p => ({ ...p, vars: { ...(p.vars || {}), [key]: val }}));

  const previewStyle: React.CSSProperties = useMemo(() => {
    const style: Record<string, string> = {};
    Object.entries(t.vars || {}).forEach(([k, v]) => (style[`--${k}`] = v));
    // 壁紙（色/画像URLは vars で、アップロードはサムネをbody背景に）
    if (t.wallpaperThumb) {
      style['--hk-wallpaper-image'] = `url(${t.wallpaperThumb})`;
    }
    return style as React.CSSProperties;
  }, [t]);

  const onUpload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/settings/theme/wallpaper', { method: 'POST', body: fd });
    if (!r.ok) { setErr('壁紙の処理に失敗しました'); return; }
    const j = await r.json();
    setT(p => ({ ...p, wallpaperThumb: j.thumbDataUrl }));
  };

  const onPickFile = () => (document.getElementById('wall-file') as HTMLInputElement)?.click();
  const onPickCamera = () => (document.getElementById('wall-camera') as HTMLInputElement)?.click();
  const onClearWallpaper = () => setT(p => ({ ...p, wallpaperThumb: null }));

  const save = async () => {
    setErr(null);
    const r = await fetch('/api/settings/theme/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    });
    if (!r.ok) { setErr('保存に失敗しました'); return; }
    router.push('/settings'); // 設定トップに戻る
  };
  const cancel = () => router.back();

  if (loading) return <PageContainer><ContentFrame title="テーマ設定"><div>読み込み中…</div></ContentFrame></PageContainer>;

  const HR = () => <hr className="hk-frame__hr" />;

  const Row = ({ label, children }: any) => (
    <div style={{ display:'grid', gridTemplateColumns:'160px 1fr', gap:8, alignItems:'center' }}>
      <div style={{ fontWeight:600 }}>{label}</div><div>{children}</div>
    </div>
  );

  const ColorInput = ({varName}:{varName:string}) => (
    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
      <input
        type="color"
        value={t.vars?.[varName] || '#ffffff'}
        onChange={(e)=>setVar(varName, e.target.value)}
        style={{ width: 36, height: 36, padding: 0, border: '1px solid var(--hk-border)', borderRadius: 6 }}
      />
      <input
        value={t.vars?.[varName] || ''}
        onChange={(e)=>setVar(varName, e.target.value)}
        placeholder="#334155 / rgba(...) / var(...)"
        style={{ flex:1, padding:'6px 8px', border:'1px solid var(--hk-border)', borderRadius:6 }}
      />
    </div>
  );

  return (
    <PageContainer>
      <ContentFrame
        title="テーマ設定"
        right={(
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" onClick={save}><Save size={16} style={{ marginRight:6 }} /> 保存</button>
            <button className="btn" onClick={cancel}><X size={16} style={{ marginRight:6 }} /> キャンセル</button>
          </div>
        )}
      >
        <div style={{ display:'grid', gap:12 }}>
          {/* ▼ 壁紙プレビュー（最上部） */}
          <div style={{
            ...previewStyle,
            border:'1px dashed var(--hk-border)',
            borderRadius:8,
            padding:12,
            background:'var(--hk-content-bg, #fff)',
          }}>
            <div
              style={{
                height: 140,
                borderRadius:6,
                background: 'var(--hk-wallpaper-color,#f7f7f8)',
                backgroundImage: 'var(--hk-wallpaper-image, none)',
                backgroundRepeat: 'repeat',
                display:'grid',
                placeItems:'center',
                color:'#666'
              }}
            >
              壁紙プレビュー
            </div>
          </div>

          {/* --- 壁紙 --- */}
          <HR />
          <Row label="壁紙（色）">
            <ColorInput varName="hk-wallpaper-color" />
          </Row>
          <Row label="壁紙（画像URL）">
            <input
              value={t.vars?.['hk-wallpaper-image'] || ''}
              onChange={(e)=>setVar('hk-wallpaper-image', e.target.value)}
              placeholder="url(/path/to.png)"
              style={{ width:'100%', padding:'6px 8px', border:'1px solid var(--hk-border)', borderRadius:6 }}
            />
          </Row>
          <Row label="壁紙（アップロード/撮影）">
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <button className="btn" onClick={onPickFile}><ImageIcon size={16} style={{ marginRight:6 }} /> 画像</button>
              <button className="btn" onClick={onPickCamera}><Camera size={16} style={{ marginRight:6 }} /> カメラ</button>
              {t.wallpaperThumb && (
                <>
                  <img src={t.wallpaperThumb} alt="thumb" style={{ height:36, borderRadius:4, border:'1px solid var(--hk-border)' }} />
                  <button className="btn" onClick={onClearWallpaper}><Trash2 size={16} style={{ marginRight:6 }} /> クリア</button>
                </>
              )}
              <input id="wall-file" type="file" accept="image/*" hidden
                onChange={async (e)=>{ const f = e.currentTarget.files?.[0]; if (f) await onUpload(f); e.currentTarget.value=''; }} />
              <input id="wall-camera" type="file" accept="image/*" capture="environment" hidden
                onChange={async (e)=>{ const f = e.currentTarget.files?.[0]; if (f) await onUpload(f); e.currentTarget.value=''; }} />
            </div>
          </Row>

          {/* ▼ 共通プレビュー（見出し風） */}
          <HR />
          <div style={{
            ...previewStyle,
            border:'1px dashed var(--hk-border)',
            borderRadius:8,
            padding:12,
            background:'var(--hk-content-bg, #fff)'
          }}>
            <div style={{
              background:'var(--hk-toolbar-bg,#111827)',
              color:'var(--hk-toolbar-fg,#e5e7eb)',
              borderRadius:6,
              padding:8,
              marginBottom:8
            }}>
              ツールバー（プレビュー）
            </div>
            <input
              placeholder="入力プレビュー"
              style={{
                width:'100%',
                padding:'6px 8px',
                border:'1px solid var(--hk-input-border,#cbd5e1)',
                color:'var(--hk-input-fg,#111827)',
                background:'var(--hk-input-bg,#fff)',
                borderRadius:6,
                marginBottom:8
              }}
            />
            <button className="btn" style={{
              background:'var(--hk-btn-bg,#fff)',
              color:'var(--hk-btn-fg,#111827)',
              borderColor:'var(--hk-btn-border,#9aa3af)'
            }}>
              ボタン（プレビュー）
            </button>
          </div>

          {/* --- ヘッダ --- */}
          <HR />
          <Row label="ヘッダ背景（画像URL）">
            <input
              value={t.vars?.['hk-header-image'] || ''}
              onChange={(e)=>setVar('hk-header-image', e.target.value)}
              placeholder="url(/path/to.svg)"
              style={{ width:'100%', padding:'6px 8px', border:'1px solid var(--hk-border)', borderRadius:6 }}
            />
          </Row>
          <Row label="ヘッダ文字色"><ColorInput varName="hk-header-fg" /></Row>

          {/* --- ツールバー --- */}
          <HR />
          <Row label="背景色"><ColorInput varName="hk-toolbar-bg" /></Row>
          <Row label="文字色"><ColorInput varName="hk-toolbar-fg" /></Row>

          {/* --- コンテンツ --- */}
          <HR />
          <Row label="背景色"><ColorInput varName="hk-content-bg" /></Row>

          {/* --- 入力 --- */}
          <HR />
          <Row label="背景色"><ColorInput varName="hk-input-bg" /></Row>
          <Row label="枠線色"><ColorInput varName="hk-input-border" /></Row>
          <Row label="文字色"><ColorInput varName="hk-input-fg" /></Row>

          {/* --- ボタン --- */}
          <HR />
          <Row label="背景色"><ColorInput varName="hk-btn-bg" /></Row>
          <Row label="枠線色"><ColorInput varName="hk-btn-border" /></Row>
          <Row label="文字色"><ColorInput varName="hk-btn-fg" /></Row>

          {/* --- 基本情報 --- */}
          <HR />
          <Row label="テーマ名">
            <input
              value={t.name}
              onChange={(e)=>setT(p=>({ ...p, name: e.target.value }))}
              style={{ width:'100%', padding:'6px 8px', border:'1px solid var(--hk-border)', borderRadius:6 }}
            />
          </Row>

          {err && <div style={{ color:'#b91c1c' }}>{err}</div>}
        </div>
      </ContentFrame>
    </PageContainer>
  );
}
