'use client';

import { useEffect, useState } from 'react';
import RegisterStepNav from '@/app/components/RegisterStepNav';
import { ensureActiveDraft, loadActiveDraft, saveDraft, setDraftStep } from '@/lib/register-draft';
import { newBoxCode } from '@/lib/codegen';
import { parseTags } from '@/lib/img'; // 既存のタグ分割 util

export default function RegisterBoxPage() {
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  useEffect(() => {
    (async () => {
      const d = await ensureActiveDraft();
      setCode(d.box?.code ?? '');
      setName(d.box?.name ?? '');
      setLocation(d.box?.location ?? '');
      setTagsInput((d.box?.tags ?? []).join(' '));
      setLoading(false);
    })();
  }, []);

  async function handleGenCode() {
    const c = newBoxCode();
    setCode(c);
  }

  async function handleSaveAndNext() {
    await saveDraft({
      box: {
        ...(await loadActiveDraft())?.box,
        code: code.trim(),
        name: name.trim(),
        location: location.trim() || null,
        tags: parseTags(tagsInput),
      },
    });
    await setDraftStep('items');
    location.assign('/register/items');
  }

  if (loading) return <div>読み込み中…</div>;

  return (
    <div className="container">
      <RegisterStepNav />
      <h2 style={{margin:'8px 0'}}>① 箱コード発行 / 箱の基本情報</h2>

      <div className="form-row">
        <label>箱コード</label>
        <div style={{display:'flex', gap:8}}>
          <input value={code} onChange={e=>setCode(e.target.value)} placeholder="例: B-202510-0001" />
          <button className="btn" onClick={handleGenCode}>自動発行</button>
        </div>
        <small>※ 後でQR発行に使います。重複しない形式で。</small>
      </div>

      <div className="form-row">
        <label>箱名（任意）</label>
        <input value={name} onChange={e=>setName(e.target.value)} />
      </div>

      <div className="form-row">
        <label>場所ラベル（任意／例: 倉庫A）</label>
        <input value={location} onChange={e=>setLocation(e.target.value)} />
      </div>

      <div className="form-row">
        <label>タグ（空白区切り）</label>
        <input value={tagsInput} onChange={e=>setTagsInput(e.target.value)} placeholder="引越し キッチン など" />
      </div>

      <div style={{display:'flex', gap:12, marginTop:12}}>
        <button className="btn" onClick={handleSaveAndNext}>保存して『アイテム』へ</button>
      </div>
    </div>
  );
}
