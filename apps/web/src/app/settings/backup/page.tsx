'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { clearAllLocalData, exportBackup, getDbCounts, importBackup } from '@/lib/backup';
import { useSettings } from '@/lib/settings';
import { db } from '@/lib/db';

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
  const {settings: s} = useSettings();
  const [syncBusy, setSyncBusy] = useState(false);

  useEffect(() => {
    refreshCounts();
  }, []);

  const refreshCounts = async () => {
    const c = await getDbCounts();
    setCounts(c);
  };

  async function getAllForPush() {
    const [boxes, items] = await Promise.all([db.boxes.toArray(), db.items.toArray()]);
    // Dexie の tags は配列。サーバーは Json で受けるのでそのままでOK
    return { boxes, items };
  }
  async function getLatestUpdatedAtIso() {
    const [b, i] = await Promise.all([db.boxes.toArray(), db.items.toArray()]);
    const maxTs = Math.max(
      0,
      ...b.map(x => new Date(x.updatedAt).getTime()),
      ...i.map(x => new Date(x.updatedAt).getTime())
    );
    return maxTs ? new Date(maxTs).toISOString() : undefined;
  }
  async function doPush() {
    if (!s.syncBaseUrl || !s.syncToken) { alert('同期URL/トークンを設定してください'); return; }
    setSyncBusy(true);
    try {
      const body = await getAllForPush();
      const res = await fetch(`${s.syncBaseUrl.replace(/\/+$/,'')}/api/sync/push`, {
        method: 'POST',
        headers: { 'content-type':'application/json', authorization: `Bearer ${s.syncToken}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setLog('サーバーへ PUSH 完了');
    } catch (e:any) {
      alert(`PUSH 失敗: ${e.message ?? e}`);
    } finally {
      setSyncBusy(false);
    }
  }
  async function doPull(full = false) {
    if (!s.syncBaseUrl || !s.syncToken) { alert('同期URL/トークンを設定してください'); return; }
    setSyncBusy(true);
    try {
      const since = full ? undefined : await getLatestUpdatedAtIso();
      const u = new URL(`${s.syncBaseUrl.replace(/\/+$/,'')}/api/sync/pull`);
      if (since) u.searchParams.set('since', since);
      const res = await fetch(u, { headers: { authorization: `Bearer ${s.syncToken}` } });
      if (!res.ok) throw new Error(await res.text());
      const { boxes, items } = await res.json();

      // 既存の "merge" 相当（updatedAt 比較）でローカルへ反映
      await db.transaction('rw', db.boxes, db.items, async () => {
        // Box: code 突合
        for (const b of boxes as any[]) {
          const hit = await db.boxes.where('code').equals(b.code).first();
          if (!hit) {
            await db.boxes.add(b);
          } else if (new Date(b.updatedAt).getTime() > new Date(hit.updatedAt).getTime()) {
            await db.boxes.update(hit.id, {
              name: b.name, location: b.location ?? '', tags: b.tags ?? [],
              updatedAt: b.updatedAt,
            } as any);
          }
        }
        // Item: id 突合
        for (const it of items as any[]) {
          const hit = await db.items.get(it.id);
          if (!hit) {
            await db.items.add(it);
          } else if (new Date(it.updatedAt).getTime() > new Date(hit.updatedAt).getTime()) {
            await db.items.update(hit.id, {
              name: it.name, tags: it.tags ?? [], note: it.note ?? '',
              boxId: it.boxId, updatedAt: it.updatedAt,
            } as any);
          }
        }
      });

      await refreshCounts();
      setLog(`PULL 完了（${since ? '差分' : '全量'}）`);
    } catch (e:any) {
      alert(`PULL 失敗: ${e.message ?? e}`);
    } finally {
      setSyncBusy(false);
    }
  }

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

      <Section title="サーバー同期（自己ホスト）">
        <div className="row" style={{ gap:8 }}>
          <button className="btn" onClick={() => doPush()} disabled={syncBusy}>PUSH（ローカル→サーバー）</button>
          <button className="btn" onClick={() => doPull(false)} disabled={syncBusy}>PULL 差分</button>
          <button className="btn" onClick={() => doPull(true)} disabled={syncBusy}>PULL 全量</button>
        </div>
        <p className="search-help">※ 認証は Bearer Token（設定で指定）。/api/sync/pull / push を使用。</p>
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
