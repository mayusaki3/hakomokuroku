'use client';
import { useEffect, useState } from 'react';
import { exportZip, importZip, downloadBlob } from '@/lib/backup';

export default function BackupPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [est, setEst] = useState<{usage?: number; quota?: number}>({});

  useEffect(() => {
    (async () => {
      if (navigator.storage?.estimate) {
        const e = await navigator.storage.estimate();
        setEst({ usage: e.usage, quota: e.quota });
      }
    })();
  }, []);

  const onExport = async () => {
    setBusy(true); setMsg('');
    try {
      const { blob, summary } = await exportZip();
      downloadBlob(blob, summary.filename);
      const mb = (summary.bytes ?? 0) / (1024*1024);
      setMsg(`エクスポート完了: boxes=${summary.boxes}, items=${summary.items}, images=${summary.images}, ${(mb).toFixed(2)} MB`);
    } catch (e:any) {
      setMsg(`エクスポート失敗: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (file: File) => {
    setBusy(true); setMsg('');
    try {
      const res = await importZip(file);
      setMsg(`インポート完了: boxes +${res.added.boxes}, items +${res.added.items}, images +${res.added.images}` +
             (res.warnings.length ? ` / 注意: ${res.warnings.join('; ')}` : ''));
    } catch (e:any) {
      setMsg(`インポート失敗: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1>バックアップ／復元</h1>

      <section style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <h2>エクスポート（Zip）</h2>
        <p>IndexedDB 内のデータ（箱・アイテム・画像）を Zip にまとめてダウンロードします。</p>
        <button onClick={onExport} disabled={busy} style={{ padding: '8px 12px' }}>
          {busy ? '処理中…' : 'すべてエクスポート'}
        </button>
      </section>

      <section style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
        <h2>インポート（Zip）</h2>
        <p>過去にエクスポートした Zip を選択してください。既存データは<strong>上書きせず</strong>、重複コードは <code>-IMP</code> を付与して追記します。</p>
        <input type="file" accept=".zip,application/zip" onChange={e => {
          const f = e.target.files?.[0]; if (f) onImport(f);
        }} />
      </section>

      <section style={{ marginTop: 16, color: '#555' }}>
        <h3>ストレージ使用量</h3>
        <div>使用量: {est.usage ? (est.usage/1024/1024).toFixed(1) : '-'} MB / クォータ: {est.quota ? (est.quota/1024/1024).toFixed(1) : '-'} MB</div>
      </section>

      {msg && <p style={{ marginTop: 16 }}><b>{msg}</b></p>}
    </main>
  );
}
