'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { clearAllLocalData, exportBackup, getDbCounts, importBackup } from '@/lib/backup';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 12 }}>
      <h2 style={{ margin: '4px 0 8px', fontSize: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsBackupPage() {
  const [counts, setCounts] = useState<{boxes:number;items:number}>({ boxes: 0, items: 0 });
  const [includeThumbs, setIncludeThumbs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>('');

  useEffect(() => {
    refreshCounts();
  }, []);

  const refreshCounts = async () => {
    const c = await getDbCounts();
    setCounts(c);
  };

  const onExport = async () => {
    try {
      setBusy(true);
      const { blob, filename, size } = await exportBackup({ includeThumbs });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setLog(`バックアップを書き出しました: ${filename} (${Math.round(size/1024)} KB)`);
      setTimeout(() => URL.revokeObjectURL(a.href), 0);
    } catch (e:any) {
      alert(`書き出しに失敗: ${e.message ?? e}`);
    } finally { setBusy(false); }
  };

  const fileRef = useRef<HTMLInputElement | null>(null);
  const onImport = async (strategy: 'merge'|'replace') => {
    const input = fileRef.current;
    if (!input || !input.files?.length) {
      alert('バックアップJSONを選択してください');
      return;
    }
    const file = input.files[0];
    try {
      setBusy(true);
      await importBackup(file, strategy);
      await refreshCounts();
      setLog(`インポート(${strategy})が完了しました: ${file.name}`);
    } catch (e:any) {
      alert(`インポートに失敗: ${e.message ?? e}`);
    } finally { setBusy(false); }
  };

  const onClear = async () => {
    if (!confirm('ローカルの箱・アイテムを全て削除します。よろしいですか？')) return;
    await clearAllLocalData();
    await refreshCounts();
    setLog('ローカルデータを削除しました。');
  };

  const onResetSW = async () => {
    if (!('serviceWorker' in navigator)) { alert('Service Worker 未対応'); return; }
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
    setLog('Service Worker を解除しました。ページを再読み込みします。');
    location.reload();
  };

  return (
    <main className="container bottom-safe" style={{ display:'grid', gap:12, paddingTop:8 }}>
      <Section title="ステータス">
        <div>箱: <b>{counts.boxes}</b>　アイテム: <b>{counts.items}</b></div>
        <p className="search-help">PC とスマホ間の同期は、以下の書き出し/読み込みで実現できます。</p>
      </Section>

      <Section title="書き出し（バックアップ）">
        <label style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
          <input type="checkbox" checked={includeThumbs} onChange={e=>setIncludeThumbs(e.target.checked)} />
          画像サムネ（photoThumbs）も含める（ファイルサイズが大きくなります）
        </label>
        <button className="btn" onClick={onExport} disabled={busy}>JSON をダウンロード</button>
      </Section>

      <Section title="読み込み（手動同期）">
        <input ref={fileRef} type="file" accept="application/json" />
        <div className="row" style={{ marginTop:8 }}>
          <button className="btn" onClick={() => onImport('merge')} disabled={busy}>マージで取り込む</button>
          <button className="btn" onClick={() => onImport('replace')} disabled={busy}>置換で取り込む（上級者向け）</button>
        </div>
        <p className="search-help">
          マージ: 既存と突合して、新しい更新日時の内容を優先します。<br />
          置換: 既存データを消去して、バックアップの内容に置換します。
        </p>
      </Section>

      <Section title="ローカルデータの管理">
        <button className="btn" onClick={onClear} disabled={busy} style={{ borderColor:'#ef4444', color:'#ef4444' }}>
          すべて削除（ローカルのみ）
        </button>
        <div className="row" style={{ marginTop:8 }}>
          <button className="btn" onClick={onResetSW}>キャッシュをクリアして再読み込み（SWリセット）</button>
        </div>
        <p className="search-help">
          表示が更新されない/古いリソースが出る場合は、Service Worker を解除して再読み込みしてください。
        </p>
      </Section>

      {log && (
        <div className="card" style={{ padding:12 }}>
          <div style={{ fontWeight:600 }}>ログ</div>
          <div style={{ fontSize:13, color:'#555', whiteSpace:'pre-wrap' }}>{log}</div>
        </div>
      )}
    </main>
  );
}
