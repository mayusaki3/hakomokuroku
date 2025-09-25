'use client';
import { useEffect, useState } from 'react';
import { createBox, isBoxCodeTaken } from '@/lib/db';
import { generateBoxCode } from '@/lib/id';
import { useRouter } from 'next/navigation';

export default function NewBoxPage() {
  const router = useRouter();
  const [code, setCode] = useState(generateBoxCode());
  const [name, setName] = useState('新しい箱');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState<boolean | null>(null);

  useEffect(() => {
    // “消えにくい保存”を要求（失敗してもOK）
    (async () => {
      if (navigator.storage?.persist) {
        try { await navigator.storage.persist(); } catch {}
      }
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const taken = await isBoxCodeTaken(code);
      if (mounted) setDup(taken);
    })();
    return () => { mounted = false; };
  }, [code]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setBusy(true);
      const boxId = await createBox({
        code,
        name: name.trim() || code,
        location: location.trim() || undefined,
        tags: tags.split(',').map(s => s.trim()).filter(Boolean),
      });
      router.push(`/boxes/${boxId}`);
    } catch (err: any) {
      alert(err?.message ?? '保存に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1>箱の作成</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>箱コード
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} style={{ flex: 1, padding: 8 }} />
            <button type="button" onClick={() => setCode(generateBoxCode())}>自動生成</button>
          </div>
          {dup === true && <div style={{ color: '#b91c1c' }}>このコードは既に使われています</div>}
          {dup === false && <div style={{ color: '#16a34a' }}>利用可能です</div>}
        </label>
        <label>箱名
          <input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
        <label>場所 / 保管先
          <input value={location} onChange={e => setLocation(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>
        <label>タグ（カンマ区切り）
          <input value={tags} onChange={e => setTags(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={busy || dup === true} style={{ padding: '8px 12px' }}>
            {busy ? '保存中…' : '保存'}
          </button>
          <a href="/boxes" style={{ padding: '8px 12px', border: '1px solid #ddd', textDecoration: 'none' }}>一覧へ</a>
        </div>
      </form>
    </main>
  );
}
