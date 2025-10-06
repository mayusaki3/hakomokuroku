'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { db, Box, Item } from '@/lib/db';
import { useDexieLive } from '@/lib/live';
import { newBoxCode } from '@/lib/codegen';
import { fileToThumbDataUrl, parseTags } from '@/lib/img';
import QrLabel24 from '@/components/QrLabel24';

type BoxDraft = Box & {
  photoThumbs?: string[]; // 任意フィールド（未インデックス）
};
type ItemDraft = Item & {
  photoThumbs?: string[]; // 任意フィールド（未インデックス）
};

function SectionTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 style={{ margin: '8px 0 4px', fontSize: 16 }}>
      <span style={{ display:'inline-block', width:22, height:22, borderRadius:6, border:'1px solid #e5e7eb', textAlign:'center', lineHeight:'20px', marginRight:6 }}>
        {n}
      </span>
      {children}
    </h2>
  );
}

export default function RegisterFastPage() {
  // 1) 箱コード発行 / 箱ドラフト
  const [boxId, setBoxId] = useState<string | null>(null);
  const [boxCode, setBoxCode] = useState<string>('');
  const [boxName, setBoxName] = useState('');
  const [boxLocation, setBoxLocation] = useState('');
  const [boxTags, setBoxTags] = useState('');
  const [boxPhotos, setBoxPhotos] = useState<string[]>([]);

  // 2) アイテム追加（フォーム一時値）
  const [itemName, setItemName] = useState('');
  const [itemTags, setItemTags] = useState('');
  const [itemNote, setItemNote] = useState('');
  const [itemPhotos, setItemPhotos] = useState<string[]>([]);

  // 3) QR ラベル発行のための ref
  const qrRef = useRef<HTMLDivElement | null>(null);

  // 箱のアイテム数（ライブ）
  const { data: itemsInBox = [] } = useDexieLive<Item[]>(
    async () => {
      if (!boxId) return [];
      return db.items.where('boxId').equals(boxId).reverse().toArray();
    },
    [boxId],
    [],
  );

  const itemCount = itemsInBox.length;

  // 箱コード発行（箱の下書き登録）
  const createBoxDraft = async () => {
    const code = newBoxCode();
    const now = new Date().toISOString();
    const draft: BoxDraft = {
      id: crypto.randomUUID(),
      code,
      name: '', location: '', tags: [],
      createdAt: now, updatedAt: now,
      photoThumbs: [],
    } as any;
    await db.boxes.add(draft as Box);
    setBoxId(draft.id);
    setBoxCode(code);
  };

  // 画像選択（共通）
  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>, setter: (a: string[]) => void, cur: string[]) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const thumbs: string[] = [];
    for (const f of files) {
      try { thumbs.push(await fileToThumbDataUrl(f, 640)); } catch {}
    }
    setter([...cur, ...thumbs]);
    // クリアして次の選択でもchangeが発火するように
    e.target.value = '';
  };

  // アイテム登録
  const addItem = async () => {
    if (!boxId) {
      alert('先に「箱コード発行」を行ってください。');
      return;
    }
    const now = new Date().toISOString();
    const it: ItemDraft = {
      id: crypto.randomUUID(),
      boxId,
      name: itemName || `アイテム ${itemCount + 1}`,
      tags: parseTags(itemTags),
      note: itemNote || '',
      createdAt: now,
      updatedAt: now,
      photoThumbs: [...itemPhotos],
    } as any;

    await db.items.add(it as Item);
    // 入力は継続しやすいように写真だけクリア（名前/タグ/メモは残す方が連続登録しやすい）
    setItemPhotos([]);
  };

  // 箱登録（情報＋写真を反映）
  const finalizeBox = async () => {
    if (!boxId) {
      alert('先に「箱コード発行」を行ってください。');
      return;
    }
    const now = new Date().toISOString();
    await db.boxes.update(boxId, {
      name: boxName.trim(),
      location: boxLocation.trim(),
      tags: parseTags(boxTags),
      updatedAt: now,
      photoThumbs: boxPhotos,
    } as any);
    alert('箱を更新しました。');
  };

  // ラベル印刷（既存の /labels/new を再利用）
  const openLabelPage = () => {
    if (!boxCode) return;
    const params = new URLSearchParams({ code: boxCode });
    window.open(`/labels/new?${params.toString()}`, '_blank');
  };

  // 既存の箱ドラフトがあれば復帰（リロード等）
  useEffect(() => {
    // 直近の箱データを拾う（未入力でもOK）
    (async () => {
      const last = await db.boxes.orderBy('createdAt').last();
      if (!last) return;
      setBoxId(last.id);
      setBoxCode(last.code);
      setBoxName(last.name ?? '');
      setBoxLocation(last.location ?? '');
      setBoxTags((last.tags ?? []).join(' '));
      // @ts-ignore
      setBoxPhotos((last.photoThumbs ?? []) as string[]);
    })();
  }, []);

  // 画面
  return (
    <main className="container bottom-safe" style={{ display: 'grid', gap: 12, paddingTop: 8 }}>
      {/* 1. 箱コード発行 */}
      <section className="card" style={{ padding: 12 }}>
        <SectionTitle n={1}>箱コード発行（ここで箱を登録）</SectionTitle>
        {!boxId ? (
          <button className="btn" onClick={createBoxDraft}>箱コードを発行</button>
        ) : (
          <div className="row" style={{ alignItems: 'center', gap: 12 }}>
            <div>コード: <code style={{ fontSize: 16 }}>{boxCode}</code></div>
            <div>現在のアイテム数: <b>{itemCount}</b></div>
          </div>
        )}
      </section>

      {/* 2. アイテム追加（撮影→サムネ→登録を繰り返す） */}
      <section className="card" style={{ padding: 12 }}>
        <SectionTitle n={2}>アイテム追加（撮影→サムネ→登録を繰り返す）</SectionTitle>

        <div className="row" style={{ gap: 8 }}>
          <label className="btn" style={{ cursor:'pointer' }}>
            撮影/画像追加
            <input type="file" accept="image/*" capture="environment" multiple
              onChange={(e) => pickImage(e, setItemPhotos, itemPhotos)}
              style={{ display:'none' }} />
          </label>
          <button className="btn" onClick={addItem} disabled={!boxId || itemPhotos.length === 0}>
            登録（写真を必須）
          </button>
        </div>

        {/* サムネ */}
        {itemPhotos.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(96px,1fr))', gap: 8, marginTop: 8 }}>
            {itemPhotos.map((src, i) => (
              <img key={i} src={src} alt={`item-${i}`} style={{ width:'100%', borderRadius:8, border:'1px solid #eee' }} />
            ))}
          </div>
        )}

        {/* メタ情報（あれば一緒に登録） */}
        <div style={{ display:'grid', gap: 8, marginTop: 8 }}>
          <input value={itemName} onChange={e=>setItemName(e.target.value)} placeholder="（任意）名前" />
          <input value={itemTags} onChange={e=>setItemTags(e.target.value)} placeholder="（任意）タグ（空白/カンマ区切り）" />
          <textarea value={itemNote} onChange={e=>setItemNote(e.target.value)} placeholder="（任意）メモ" rows={3} />
        </div>

        <p className="search-help">
          ※ 登録を押すと写真つきアイテムを箱に追加します。<br />
          ※ 名前・タグ・メモが入っていれば一緒に保存されます（未入力でもOK）。
        </p>
      </section>

      {/* 3. 箱の写真を撮影→箱登録（情報もここで保存） */}
      <section className="card" style={{ padding: 12 }}>
        <SectionTitle n={3}>箱の写真を撮影→箱登録（情報も一緒に）</SectionTitle>

        <div className="row" style={{ gap: 8 }}>
          <label className="btn" style={{ cursor:'pointer' }}>
            撮影/画像追加
            <input type="file" accept="image/*" capture="environment" multiple
              onChange={(e) => pickImage(e, setBoxPhotos, boxPhotos)}
              style={{ display:'none' }} />
          </label>
          <button className="btn" onClick={finalizeBox} disabled={!boxId}>
            箱を登録/更新
          </button>
        </div>

        {boxPhotos.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(96px,1fr))', gap: 8, marginTop: 8 }}>
            {boxPhotos.map((src, i) => (
              <img key={i} src={src} alt={`box-${i}`} style={{ width:'100%', borderRadius:8, border:'1px solid #eee' }} />
            ))}
          </div>
        )}

        <div style={{ display:'grid', gap: 8, marginTop: 8 }}>
          <input value={boxName} onChange={e=>setBoxName(e.target.value)} placeholder="（任意）箱名" />
          <input value={boxLocation} onChange={e=>setBoxLocation(e.target.value)} placeholder="（任意）場所" />
          <input value={boxTags} onChange={e=>setBoxTags(e.target.value)} placeholder="（任意）タグ（空白/カンマ区切り）" />
        </div>

        <p className="search-help">
          ※ このボタンで箱の情報（名前/場所/タグ）と箱の写真サムネを保存します。<br />
          ※ 箱コードやアイテムはそのまま維持されます。
        </p>
      </section>

      {/* 4. QRラベル発行 */}
      <section className="card" style={{ padding: 12 }}>
        <SectionTitle n={4}>QRラベル発行</SectionTitle>
        {!boxCode ? (
          <p className="search-help">先に「箱コード発行」を実行してください。</p>
        ) : (
          <>
            <div ref={qrRef} style={{ background:'#fff', padding: 8, border:'1px solid #eee', display:'inline-block', borderRadius: 8 }}>
              {/* 既存のラベルコンポーネントを再利用（24mm幅想定） */}
              <QrLabel24 code={boxCode} />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={openLabelPage}>ラベル印刷ページを開く</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
