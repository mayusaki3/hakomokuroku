'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Box, Item, db } from '@/lib/db';
import { useDexieLive } from '@/lib/live';

// ハイライト（単純な大小無視の部分一致）
function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

// 簡易スコアリング：ヒット位置によって点数を変える
function scoreBox(b: Box, q: string) {
  const s = q.toLowerCase();
  let score = 0;
  if (b.code.toLowerCase().includes(s)) score += 5;
  if (b.name.toLowerCase().includes(s)) score += 4;
  if ((b.location ?? '').toLowerCase().includes(s)) score += 2;
  if ((b.tags ?? []).some((t) => t.toLowerCase().includes(s))) score += 3;
  return score;
}
function scoreItem(it: Item, q: string) {
  const s = q.toLowerCase();
  let score = 0;
  if (it.name.toLowerCase().includes(s)) score += 4;
  if ((it.tags ?? []).some((t) => t.toLowerCase().includes(s))) score += 3;
  if ((it.features ?? '').toLowerCase().includes(s)) score += 2;
  if ((it.note ?? '').toLowerCase().includes(s)) score += 1;
  return score;
}

export default function SearchPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(sp.get('q') ?? '');

  // URLクエリ ↔ 入力欄 同期（Enterで確定、もしくは入力後1秒で反映）
  useEffect(() => setQ(sp.get('q') ?? ''), [sp]);
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(Array.from(sp.entries()));
      if (q) params.set('q', q);
      else params.delete('q');
      router.replace(`/search?${params.toString()}`);
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // live 取得（常に最新）
  const { data: boxes } = useDexieLive<Box[]>(
    async () => db.boxes.orderBy('updatedAt').reverse().toArray(),
    [],
    []
  );
  const { data: items } = useDexieLive<Item[]>(
    async () => db.items.orderBy('updatedAt').reverse().toArray(),
    [],
    []
  );

  // フィルタ＆スコア
  const { boxHits, itemHits } = useMemo(() => {
    if (!q.trim())
      return {
        boxHits: [] as Array<{ b: Box; score: number }>,
        itemHits: [] as Array<{ it: Item; box?: Box; score: number }>,
      };

    const bs = boxes
      .map((b) => ({ b, score: scoreBox(b, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.b.updatedAt - a.b.updatedAt);

    // アイテムは所属箱も調べたいので boxMap を作る
    const map = new Map(boxes.map((b) => [b.id, b]));
    const is = items
      .map((it) => ({ it, box: map.get(it.boxId), score: scoreItem(it, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (b.it.updatedAt ?? 0) - (a.it.updatedAt ?? 0));

    return { boxHits: bs, itemHits: is };
  }, [boxes, items, q]);

  const hasQ = q.trim().length > 0;

  return (
    <main style={{ padding: 24 }}>
      <h1>検索</h1>

      <div style={{ display: 'grid', gap: 8, maxWidth: 840, marginBottom: 16 }}>
        <input
          autoFocus
          placeholder="キーワード（コード／箱名／場所／タグ／アイテム名／メモ）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          style={{ padding: 10, fontSize: 16 }}
        />
        <div style={{ color: '#555', fontSize: 12 }}>
          例: <code>BX-</code> / <code>本</code> / <code>タグ:冬物</code>（将来拡張予定）
        </div>
      </div>

      {!hasQ && <p style={{ color: '#666' }}>キーワードを入力してください。</p>}

      {hasQ && (
        <>
          <section style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>
              箱 <small style={{ color: '#555' }}>（{boxHits.length}件）</small>
            </h2>
            {boxHits.length === 0 && <p>該当なし</p>}
            <div style={{ display: 'grid', gap: 8 }}>
              {boxHits.map(({ b, score }) => (
                <article
                  key={b.id}
                  style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 600 }}>{highlight(b.name, q)}</div>
                    <code>{highlight(b.code, q)}</code>
                  </div>
                  <div style={{ color: '#555', marginTop: 4 }}>
                    {highlight(b.location ?? '場所未設定', q)}
                    {b.tags?.length ? (
                      <>
                        {' '}
                        ｜{' '}
                        {b.tags.map((t) => (
                          <span key={t} style={{ marginRight: 6 }}>
                            {highlight(t, q)}
                          </span>
                        ))}
                      </>
                    ) : null}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a
                      href={`/boxes/${b.id}`}
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #ddd',
                        textDecoration: 'none',
                      }}
                    >
                      詳細
                    </a>
                    <a
                      href={`/boxes/${b.id}/items`}
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #ddd',
                        textDecoration: 'none',
                      }}
                    >
                      アイテム一覧
                    </a>
                    <a
                      href={`/print/tape?${new URLSearchParams({
                        code: b.code,
                        name: b.name,
                        location: b.location ?? '',
                        n: '1',
                        s: '14',
                        m: '2',
                      }).toString()}`}
                      target="_blank"
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #ddd',
                        textDecoration: 'none',
                      }}
                    >
                      テープ印刷
                    </a>
                  </div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>score={score}</div>
                </article>
              ))}
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>
              アイテム <small style={{ color: '#555' }}>（{itemHits.length}件）</small>
            </h2>
            {itemHits.length === 0 && <p>該当なし</p>}
            <div style={{ display: 'grid', gap: 8 }}>
              {itemHits.map(({ it, box, score }) => (
                <article
                  key={it.id}
                  style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 600 }}>{highlight(it.name, q)}</div>
                    <div style={{ color: '#555' }}>
                      {box ? (
                        <>
                          箱: <a href={`/boxes/${box.id}`}>{highlight(box.name, q)}</a>{' '}
                          <code>{highlight(box.code, q)}</code>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ color: '#555', marginTop: 4 }}>
                    {it.tags?.length ? (
                      <>
                        タグ:{' '}
                        {it.tags.map((t) => (
                          <span key={t} style={{ marginRight: 6 }}>
                            {highlight(t, q)}
                          </span>
                        ))}
                      </>
                    ) : null}
                    {it.note ? (
                      <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                        {highlight(it.note, q)}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a
                      href={`/items/${it.id}`}
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #ddd',
                        textDecoration: 'none',
                      }}
                    >
                      詳細
                    </a>
                    {box && (
                      <a
                        href={`/boxes/${box.id}/items`}
                        style={{
                          padding: '6px 10px',
                          border: '1px solid #ddd',
                          textDecoration: 'none',
                        }}
                      >
                        箱のアイテム一覧
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>score={score}</div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
