'use client';

import { useCallback, useRef, useState } from 'react';
import { db, type Box, type Item, type BoxLocation } from '@/lib/db';
import { newBoxCode } from '@/lib/codegen';
import { fileToThumbDataUrl, parseTags } from '@/lib/img';
import QrLabel24 from '@/app/components/QrLabel24';

type BoxDraft = Box & { photoFiles?: File[] }; // 写真は step2 で扱う
type ItemDraft = Item & { photoFiles?: File[] };
type LocDraft = BoxLocation & { photoFiles?: File[] };

const emptyBoxDraft = (): BoxDraft => ({
  id: crypto.randomUUID(),
  code: '',
  name: '',
  location: null,
  tags: [],
  thumbs: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
const newItemDraft = (boxId: string): ItemDraft => ({
  id: crypto.randomUUID(),
  boxId,
  name: '',
  tags: [],
  note: null,
  thumbs: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
const emptyLocDraft = (boxId: string): LocDraft => ({
  id: crypto.randomUUID(),
  boxId,
  thumbs: [],
  note: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export default function RegisterClient() {
  // 0=箱登録,1=アイテム,2=箱写真,3=ラベル,4=場所
  const [step, setStep] = useState<number>(0);

  const [box, setBox] = useState<BoxDraft>(emptyBoxDraft());
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [loc, setLoc] = useState<LocDraft | null>(null);

  const itemPhotoInputRef = useRef<HTMLInputElement>(null);
  const boxPhotoInputRef = useRef<HTMLInputElement>(null);
  const locPhotoInputRef = useRef<HTMLInputElement>(null);

  // --- 箱登録 ---
  const issueBoxCode = () => {
    const code = newBoxCode();
    setBox((b) => ({ ...b, code }));
  };

  const saveBoxMeta = useCallback(async () => {
    const now = new Date().toISOString();
    const payload: Box = {
      id: box.id,
      code: box.code || box.id,
      name: box.name,
      location: box.location,
      tags: box.tags ?? [],
      thumbs: box.thumbs ?? [],
      createdAt: box.createdAt,
      updatedAt: now,
    };
    await db.boxes.put(payload);
    setBox({ ...box, updatedAt: now });
  }, [box]);

  // --- アイテム ---
  const addItemDraft = () => {
    if (!box?.id) return;
    setItems((arr) => [...arr, newItemDraft(box.id)]);
  };

  const onPickItemPhotos = async (idx: number, files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files);
    const thumbs = await Promise.all(arr.map((f) => fileToThumbDataUrl(f, { max: 480 })));
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, thumbs, photoFiles: arr } : it)));
  };

  const saveItems = useCallback(async () => {
    const now = new Date().toISOString();
    const rows: Item[] = items.map((it) => ({
      id: it.id,
      boxId: it.boxId,
      name: it.name,
      tags: it.tags ?? [],
      note: it.note ?? null,
      thumbs: it.thumbs ?? [],
      createdAt: it.createdAt,
      updatedAt: now,
    }));
    if (rows.length) {
      await db.items.bulkPut(rows);
      setItems((list) => list.map((it) => ({ ...it, updatedAt: now })));
    }
  }, [items]);

  // --- 箱写真（step2）---
  const onPickBoxPhotos = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files);
    const thumbs = await Promise.all(arr.map((f) => fileToThumbDataUrl(f, { max: 480 })));
    setBox((b) => ({ ...b, thumbs }));
  };

  const saveBoxPhotos = useCallback(async () => {
    const now = new Date().toISOString();
    await db.boxes.put({
      ...box,
      thumbs: box.thumbs ?? [],
      updatedAt: now,
    });
    setBox((b) => ({ ...b, updatedAt: now }));
  }, [box]);

  // --- ラベル ---
  const printLabel = () => {
    window.print();
  };

  // --- 置き場所 ---
  const ensureLocDraft = () => {
    if (!loc) setLoc(emptyLocDraft(box.id));
  };

  const onPickLocPhotos = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files);
    const thumbs = await Promise.all(arr.map((f) => fileToThumbDataUrl(f, { max: 480 })));
    setLoc((l) => {
      const base = l ?? emptyLocDraft(box.id);
      return { ...base, thumbs };
    });
  };

  const saveLocation = useCallback(async () => {
    if (!loc) return;
    const now = new Date().toISOString();
    const row: BoxLocation = {
      id: loc.id,
      boxId: box.id,
      thumbs: loc.thumbs ?? [],
      note: loc.note ?? null,
      createdAt: loc.createdAt,
      updatedAt: now,
    };
    await db.boxLocations.put(row);
    setLoc({ ...loc, updatedAt: now });
  }, [loc, box.id]);

  // 遷移可否
  const boxIssued = !!box.code;
  const canGoItems = boxIssued;
  const canGoBoxPhotos = boxIssued;
  const canGoLabel = boxIssued;
  const canGoLocation = boxIssued;

  const go = (n: number) => setStep(n);

  return (
    <div className="container" style={{ padding: 16 }}>
      {/* ステッパー */}
      <nav className="stepper" aria-label="登録ステップ">
        <StepBtn label="箱登録" active={step === 0} onClick={() => go(0)} />
        <StepBtn label="アイテム" active={step === 1} disabled={!canGoItems} onClick={() => go(1)} />
        <StepBtn label="箱写真" active={step === 2} disabled={!canGoBoxPhotos} onClick={() => go(2)} />
        <StepBtn label="ラベル" active={step === 3} disabled={!canGoLabel} onClick={() => go(3)} />
        <StepBtn label="場所" active={step === 4} disabled={!canGoLocation} onClick={() => { ensureLocDraft(); go(4); }} />
      </nav>

      {/* 進行中の箱（箱登録後のみ表示） */}
      {boxIssued && step > 0 && (
        <div className="box-banner" role="note" aria-label="現在の箱">
          <div className="meta">
            <div><strong>箱名：</strong>{box.name || '(無題)'}</div>
            <div><strong>タグ：</strong>{(box.tags ?? []).join(' ') || '-'}</div>
          </div>
          <div className="code">CODE: {box.code}</div>
        </div>
      )}

      {/* step 0: 箱登録（写真入力はここでは不要） */}
      {step === 0 && (
        <section>
          <h3 style={{ marginTop: 8 }}>1. 箱登録</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <div>
              <button className="btn" onClick={issueBoxCode}>箱コード発行</button>
              <div style={{ marginTop: 6, fontFamily: 'monospace' }}>
                箱ID: {box.id}<br />
                箱コード: {box.code || '(未発行)'}
              </div>
            </div>
            <label>
              箱名：
              <input value={box.name} onChange={(e) => setBox({ ...box, name: e.target.value })} />
            </label>
            <label>
              箱タグ（空白/カンマ区切り）：
              <input
                onChange={(e) => setBox({ ...box, tags: parseTags(e.target.value) })}
                placeholder="引越し キッチン 小物"
              />
            </label>
            <div>
              <button className="btn primary" onClick={saveBoxMeta} disabled={!box.code}>
                箱を登録/更新（ローカル）
              </button>
              <button className="btn" onClick={() => go(1)} disabled={!canGoItems} style={{ marginLeft: 8 }}>
                次へ（アイテム）
              </button>
            </div>
          </div>
        </section>
      )}

      {/* step 1: アイテム */}
      {step === 1 && (
        <section>
          <h3>2. アイテム追加</h3>
          <div style={{ marginBottom: 8 }}>
            <button className="btn" onClick={addItemDraft}>アイテムを追加</button>
            <button className="btn primary" onClick={saveItems} disabled={!items.length} style={{ marginLeft: 8 }}>
              アイテム登録（ローカル）
            </button>
          </div>
          {!items.length && <div style={{ color: '#666' }}>まだアイテムがありません。追加してください。</div>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {items.map((it, idx) => (
              <li key={it.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label>名前：<input value={it.name} onChange={(e) => {
                    const v = e.target.value;
                    setItems(list => list.map((x, i) => i === idx ? { ...x, name: v } : x));
                  }} /></label>
                  <label>タグ：
                    <input
                      onChange={(e) => {
                        const arr = parseTags(e.target.value);
                        setItems(list => list.map((x, i) => i === idx ? { ...x, tags: arr } : x));
                      }}
                      placeholder="食器 割れ物"
                    />
                  </label>
                  <label>メモ：
                    <input
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setItems(list => list.map((x, i) => i === idx ? { ...x, note: v } : x));
                      }}
                      placeholder="取っ手に欠けあり など"
                    />
                  </label>
                  <div>
                    <label>写真： </label>
                    <input
                      ref={idx === items.length - 1 ? itemPhotoInputRef : undefined}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={(e) => onPickItemPhotos(idx, e.target.files)}
                    />
                    {!!it.thumbs?.length && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {it.thumbs.map((t, i) => (
                          <img key={i} src={t} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => go(0)}>戻る（箱登録）</button>
            <button className="btn" onClick={() => go(2)} style={{ marginLeft: 8 }}>次へ（箱写真）</button>
          </div>
        </section>
      )}

      {/* step 2: 箱写真 */}
      {step === 2 && (
        <section>
          <h3>3. 箱の写真</h3>
          <div>
            <input
              ref={boxPhotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(e) => onPickBoxPhotos(e.target.files)}
            />
          </div>
          {!!box.thumbs?.length && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {box.thumbs.map((t, i) => (
                <img key={i} src={t} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
              ))}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={saveBoxPhotos} disabled={!box.code}>箱写真を反映（ローカル保存）</button>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => go(1)}>戻る（アイテム）</button>
            <button className="btn" onClick={() => go(3)} style={{ marginLeft: 8 }}>次へ（ラベル）</button>
          </div>
        </section>
      )}

      {/* step 3: ラベル */}
      {step === 3 && (
        <section>
          <h3>4. QR ラベル発行</h3>
          {box.code ? (
            <div style={{ border: '1px dashed #ddd', padding: 12, display: 'inline-block' }}>
              <QrLabel24 code={box.code} name={box.name || '(無題)'} />
            </div>
          ) : (
            <div style={{ color: '#666' }}>先に「箱登録」でコードを生成してください。</div>
          )}
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={printLabel} disabled={!box.code}>印刷</button>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => go(2)}>戻る（箱写真）</button>
            <button className="btn" onClick={() => go(4)} style={{ marginLeft: 8 }}>次へ（場所）</button>
          </div>
        </section>
      )}

      {/* step 4: 置き場所 */}
      {step === 4 && (
        <section>
          <h3>5. 置き場所（写真＋メモ）</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <div>
              <input
                ref={locPhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(e) => onPickLocPhotos(e.target.files)}
              />
            </div>
            {!!loc?.thumbs?.length && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {loc.thumbs.map((t, i) => (
                  <img key={i} src={t} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
                ))}
              </div>
            )}
            <label>
              メモ：
              <input
                value={loc?.note ?? ''}
                onChange={(e) => setLoc((l) => {
                  const base = l ?? emptyLocDraft(box.id);
                  return { ...base, note: e.target.value || null };
                })}
                placeholder="棚A-1 / 押入れ上段 など"
              />
            </label>
            <div>
              <button className="btn primary" onClick={saveLocation} disabled={!loc}>
                置き場所を保存（ローカル）
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => go(3)}>戻る（ラベル）</button>
          </div>
        </section>
      )}
    </div>
  );
}

function StepBtn({
  label, active, disabled, onClick,
}: { label: string; active?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      className="stepbtn"
      onClick={onClick}
      aria-current={active ? 'step' : undefined}
      aria-disabled={disabled ? 'true' : undefined}
    >
      {label}
    </button>
  );
}
