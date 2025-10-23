'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ContentCard from '@/app/components/layout/ContentCard';
import { Save, X, Image as ImageIcon, Camera, Trash2 } from 'lucide-react';

type Vars = Partial<Record<string, string>>;
type ThemeDef = { id?: string; name: string; vars: Vars; wallpaperThumb?: string | null };

export default function ThemeEditorPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const mode = sp.get('mode');       // 'new' | null
  const editId = sp.get('id') || '';

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 永続データ（保存対象）
  const [t, setT] = useState<ThemeDef>({ name: '新しいテーマ', vars: {}, wallpaperThumb: null });

  // 下書き（編集中はこれだけを更新）
  const [draftName, setDraftName] = useState('新しいテーマ');
  const [draftVars, setDraftVars] = useState<Vars>({});
  const [draftWall, setDraftWall] = useState<string | null>(null); // 画像プレビューにも利用

  // 初期取得（編集時のみ）
  useEffect(() => {
    (async () => {
      try {
        if (mode !== 'new' && editId) {
          const r = await fetch(`/api/settings/theme/get?id=${encodeURIComponent(editId)}`, { cache: 'no-store' });
          if (!r.ok) throw new Error('load_failed');
          const j = await r.json();
          const next: ThemeDef = {
            id: j.theme.id,
            name: j.theme.name,
            vars: j.theme.vars || {},
            wallpaperThumb: j.theme.wallpaperThumb || null,
          };
          setT(next);
          // 下書きに同期
          setDraftName(next.name);
          setDraftVars(next.vars || {});
          setDraftWall(next.wallpaperThumb || next.vars?.['hk-wallpaper-image'] || null);
        }
        setLoading(false);
      } catch {
        setErr('読み込みに失敗しました');
        setLoading(false);
      }
    })();
  }, [mode, editId]);

  // CSSプレビューは下書きを参照（保存前でも見た目確認可、ただしグローバル適用はしない）
  const previewStyle: React.CSSProperties = useMemo(() => {
    const style: Record<string, string> = {};
    Object.entries(draftVars || {}).forEach(([k, v]) => (style[`--${k}`] = v));
    const wall = draftVars?.['hk-wallpaper-image'] || draftWall || ''; // vars優先
    style['--hk-wallpaper-image'] = wall
      ? (wall.startsWith('url(') ? wall : `url(${wall})`)
      : 'none';
    return style as React.CSSProperties;
  }, [draftVars, draftWall]);

  // 画像を 64px タイルへ正規化（拡大禁止）
  async function normalizeTile(url: string, target = 64): Promise<string> {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = rej; im.src = url;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (w <= target && h <= target) return url; // アップスケール禁止
    const scale = target / Math.max(w, h);
    const dw = Math.round(w * scale), dh = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = dw; canvas.height = dh;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high' as any;
    ctx.drawImage(img, 0, 0, dw, dh);
    return canvas.toDataURL('image/png');
  }

  // 背景画像アップロード
  const onUpload = async (file: File) => {
    setErr(null);
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/settings/theme/wallpaper', { method: 'POST', body: fd });
    if (!r.ok) { setErr('壁紙の処理に失敗しました'); return; }
    const j = await r.json();
    const tile = await normalizeTile(j.thumbDataUrl, 64);
    setDraftWall(tile);
    setDraftVars(p => ({ ...(p || {}), 'hk-wallpaper-image': tile }));
  };

  const onPickFile   = () => (document.getElementById('wall-file')   as HTMLInputElement)?.click();
  const onPickCamera = () => (document.getElementById('wall-camera') as HTMLInputElement)?.click();

  const onClearWallpaper = () => {
    setDraftWall(null);
    setDraftVars(p => {
      const v = { ...(p || {}) };
      delete v['hk-wallpaper-image'];
      return v;
    });
  };

  // 保存時のみ全体へ通知（layout側の常駐が受けて<html>へ反映）
  function persistActiveTheme(vars: Record<string, string>, id?: string) {
    try {
      localStorage.setItem('hk.themeActiveVars', JSON.stringify(vars || {}));
      if (id) localStorage.setItem('hk.themeActiveId', id);
      window.dispatchEvent(new Event('hk-theme-updated'));
    } catch { /* noop */ }
  }

  const save = async () => {
    setErr(null);
    const payload: ThemeDef = {
      ...t,
      name: draftName,
      vars: draftVars,
      wallpaperThumb: draftWall,
    };
    const r = await fetch('/api/settings/theme/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) { setErr('保存に失敗しました'); return; }
    setT(payload);
    persistActiveTheme(payload.vars || {}, payload.id);
    router.push('/settings');
  };

  const cancel = () => router.back();

  if (loading) return <ContentCard><div>読み込み中…</div></ContentCard>;

  const HR = () => <hr className="hk-frame__hr" />;

  const Row = ({ label, children }: any) => (
    <div style={{ display:'grid', gridTemplateColumns:'160px 1fr', gap:8, alignItems:'center' }}>
      <div style={{ fontWeight:600 }}>{label}</div><div>{children}</div>
    </div>
  );

  const setVar = (key: string, val: string) => {
    setDraftVars(p => ({ ...(p || {}), [key]: val }));
  };

  const ColorInput = ({varName}:{varName:string}) => {
    const val = draftVars?.[varName] || '';
    const isHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(val);
    const safeHex = isHex ? val : '#ffffff';
    return (
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        {/* color ピッカーは value 制御でOK（フォーカス問題は起きにくい） */}
        <input
          type="color"
          value={safeHex}
          onChange={(e)=>setVar(varName, e.target.value)}
          style={{ width: 36, height: 36, padding: 0, border: '1px solid var(--hk-border)', borderRadius: 6 }}
        />
        {/* テキストはアンコントロールドで blur 時に反映 */}
        <input
          key={varName + (t.id || 'new')}
          defaultValue={val}
          onBlur={(e)=> setVar(varName, e.currentTarget.value)}
          placeholder="#334155 / rgba(...) / var(...)"
          style={{ flex:1, padding:'6px 8px', border:'1px solid var(--hk-border)', borderRadius:6 }}
        />
      </div>
    );
  };

  return (
    <>
      <ContentCard>
        {/* ヘッダ行 */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <h2 style={{ fontSize:16, fontWeight:700 }}>テーマ設定</h2>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn" onClick={save}><Save size={16} style={{ marginRight:6 }} /> 保存</button>
            <button className="btn" onClick={cancel}><X size={16} style={{ marginRight:6 }} /> キャンセル</button>
          </div>
        </div>

        <HR />
        {/* テーマ名：アンコントロールド + blur反映 */}
        <Row label="テーマ名">
          <input
            key={t.id || 'new'}          /* テーマ切替時だけ初期値を更新 */
            defaultValue={draftName}
            onBlur={(e)=> setDraftName(e.currentTarget.value)}
            style={{ width:'100%', padding:'6px 8px', border:'1px solid var(--hk-border)', borderRadius:6 }}
          />
        </Row>

        <div style={{ display:'grid', gap:12 }}>
          {/* 壁紙プレビュー */}
          <div style={{
            ...previewStyle,
            border:'1px dashed var(--hk-border)',
            borderRadius:8,
            padding:12,
            background:'var(--hk-content-bg, #fff)',
          }}>
            <div className="wallpaper-preview"
              style={{
                height: 140,
                borderRadius:6,
                background: 'var(--hk-wallpaper-color,#f7f7f8)',
                backgroundImage: 'var(--hk-wallpaper-image, none)',
                backgroundRepeat: 'repeat',
                backgroundSize: 'auto',
                backgroundPosition: '0 0',
                display:'grid',
                placeItems:'center',
                color:'#666'
              }}
            >
              壁紙プレビュー
            </div>
          </div>

          {/* 壁紙 */}
          <HR />
          <Row label="壁紙（色）"><ColorInput varName="hk-wallpaper-color" /></Row>
          <Row label="壁紙（アップロード/撮影）">
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <button className="btn" onClick={onPickFile}><ImageIcon size={16} style={{ marginRight:6 }} /> 画像</button>
              <button className="btn" onClick={onPickCamera}><Camera size={16} style={{ marginRight:6 }} /> カメラ</button>
              {draftWall && (
                <>
                  <img src={draftWall} alt="thumb" style={{ height:36, borderRadius:4, border:'1px solid var(--hk-border)' }} />
                  <button className="btn" onClick={onClearWallpaper}><Trash2 size={16} style={{ marginRight:6 }} /> クリア</button>
                </>
              )}
              <input id="wall-file" type="file" accept="image/*" hidden
                onChange={async (e)=>{ const input = e.currentTarget as HTMLInputElement; const f = input.files?.[0]; input.value=''; if (f) await onUpload(f); }} />
              <input id="wall-camera" type="file" accept="image/*" capture="environment" hidden
                onChange={async (e)=>{ const input = e.currentTarget as HTMLInputElement; const f = input.files?.[0]; input.value=''; if (f) await onUpload(f); }} />
            </div>
          </Row>

          {/* 共通プレビュー（見出し風） */}
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

          {/* 以降の色入力はすべて下書き経由 */}
          <HR />
          <Row label="ヘッダ背景（画像URL）">
            <input
              value={draftVars['hk-header-image'] || ''}
              onChange={(e)=> setVar('hk-header-image', e.target.value)}
              placeholder="url(/path/to.svg)"
              style={{ width:'100%', padding:'6px 8px', border:'1px solid var(--hk-border)', borderRadius:6 }}
            />
          </Row>
          <Row label="ヘッダ文字色"><ColorInput varName="hk-header-fg" /></Row>

          <HR />
          <Row label="ツールバー 背景色"><ColorInput varName="hk-toolbar-bg" /></Row>
          <Row label="ツールバー 文字色"><ColorInput varName="hk-toolbar-fg" /></Row>

          <HR />
          <Row label="コンテンツ 背景色"><ColorInput varName="hk-content-bg" /></Row>

          <HR />
          <Row label="入力 背景色"><ColorInput varName="hk-input-bg" /></Row>
          <Row label="入力 枠線色"><ColorInput varName="hk-input-border" /></Row>
          <Row label="入力 文字色"><ColorInput varName="hk-input-fg" /></Row>

          <HR />
          <Row label="ボタン 背景色"><ColorInput varName="hk-btn-bg" /></Row>
          <Row label="ボタン 枠線色"><ColorInput varName="hk-btn-border" /></Row>
          <Row label="ボタン 文字色"><ColorInput varName="hk-btn-fg" /></Row>

          {err && <div style={{ color:'#b91c1c' }}>{err}</div>}
        </div>
      </ContentCard>
    </>
  );
}
