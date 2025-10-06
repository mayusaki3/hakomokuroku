'use client';

import Link from 'next/link';
import { useSettings } from '@/lib/settings';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 12 }}>
      <h2 style={{ margin: '4px 0 8px', fontSize: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsHomePage() {
  const { settings: s, update } = useSettings();

  return (
    <main className="container bottom-safe" style={{ display:'grid', gap:12, paddingTop:8 }}>
      <Section title="基本">
        <div className="row" style={{ alignItems:'center' }}>
          <label style={{ minWidth: 120 }}>表示名</label>
          <input value={s.displayName} onChange={e=>update('displayName', e.target.value)} placeholder="任意（共有には使われません）" />
        </div>
        <div className="row" style={{ alignItems:'center', marginTop:8 }}>
          <label style={{ minWidth: 120 }}>デバイス名</label>
          <input value={s.deviceName} onChange={e=>update('deviceName', e.target.value)} placeholder="例：自宅PC / Pixel 8 など" />
        </div>
      </Section>

      <Section title="表示">
        <div className="row" style={{ alignItems:'center' }}>
          <label style={{ minWidth: 120 }}>テーマ</label>
          <select value={s.theme} onChange={e=>update('theme', e.target.value as any)}>
            <option value="system">システムに合わせる</option>
            <option value="light">ライト</option>
            <option value="dark">ダーク</option>
          </select>
        </div>
        <div className="row" style={{ alignItems:'center', marginTop:8 }}>
          <label style={{ minWidth: 120 }}>密度</label>
          <select value={s.density} onChange={e=>update('density', e.target.value as any)}>
            <option value="comfortable">ふつう</option>
            <option value="compact">コンパクト</option>
          </select>
        </div>
      </Section>

      <Section title="スキャン">
        <label className="row" style={{ alignItems:'center' }}>
          <input type="checkbox" checked={s.preferBackCamera} onChange={e=>update('preferBackCamera', e.target.checked)} />
          背面カメラを優先する
        </label>
        <label className="row" style={{ alignItems:'center', marginTop:6 }}>
          <input type="checkbox" checked={s.scanBeep} onChange={e=>update('scanBeep', e.target.checked)} />
          読み取り時に音/バイブ
        </label>
        <label className="row" style={{ alignItems:'center', marginTop:6 }}>
          <input type="checkbox" checked={s.scanContinuous} onChange={e=>update('scanContinuous', e.target.checked)} />
          連続読み取り（将来用）
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
        <div className="row" style={{ alignItems:'center' }}>
          <label style={{ minWidth: 120 }}>テープ幅</label>
          <select value={String(s.labelTapeWidthMM)} onChange={e=>update('labelTapeWidthMM', Number(e.target.value) as any)}>
            <option value="24">24mm</option>
          </select>
        </div>
        <div className="row" style={{ alignItems:'center', marginTop:8 }}>
          <label style={{ minWidth: 120 }}>QRサイズ</label>
          <input type="number" min={8} max={48} value={s.labelQrSizeMM}
            onChange={e=>update('labelQrSizeMM', Number(e.target.value))}
            style={{ width: 96 }} /> <span style={{marginLeft:6}}>mm</span>
        </div>
        <label className="row" style={{ alignItems:'center', marginTop:6 }}>
          <input type="checkbox" checked={s.labelShowText} onChange={e=>update('labelShowText', e.target.checked)} />
          コード文字列を併記
        </label>
      </Section>

      <Section title="QR ペイロード">
        <div className="row" style={{ alignItems:'center' }}>
          <label style={{ minWidth: 120 }}>形式</label>
          <select value={s.qrPayloadMode} onChange={e=>update('qrPayloadMode', e.target.value as any)}>
            <option value="code">生コード（例: BK-XXXX）</option>
            <option value="url">URL（prefix + /b/&lt;code&gt;）</option>
          </select>
        </div>
        {s.qrPayloadMode === 'url' && (
          <div className="row" style={{ alignItems:'center', marginTop:8 }}>
            <label style={{ minWidth: 120 }}>URLプレフィックス</label>
            <input value={s.qrUrlPrefix} onChange={e=>update('qrUrlPrefix', e.target.value)} placeholder="例: https://your.host" />
          </div>
        )}
        <p className="search-help">※ URL 形式にすると、ラベルのQRスキャンでブラウザ遷移が可能になります。</p>
      </Section>

      <Section title="バックアップ（既定）">
        <label className="row" style={{ alignItems:'center' }}>
          <input type="checkbox" checked={s.backupIncludeThumbs} onChange={e=>update('backupIncludeThumbs', e.target.checked)} />
          画像サムネも含める（サイズが大きくなります）
        </label>
        <div style={{ marginTop:8 }}>
          <Link href="/settings/backup" className="btn-link">バックアップ/同期（手動）ページへ</Link>
        </div>
      </Section>
    </main>
  );
}
