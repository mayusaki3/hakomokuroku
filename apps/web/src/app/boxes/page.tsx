'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db, type Box } from '@/lib/db';

function BoxFallbackIcon() {
  // 小さめの箱＋QR風のシンプルSVG（48x48想定）
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <rect x="6" y="12" width="36" height="26" rx="6" fill="#F3F4F6" stroke="#D1D5DB"/>
      <path d="M6 18h36" stroke="#D1D5DB"/>
      <rect x="30" y="21" width="10" height="10" rx="2" fill="#111827" opacity="0.15"/>
      <rect x="31.5" y="22.5" width="3.5" height="3.5" fill="#111827"/>
      <rect x="36" y="22.5" width="2.5" height="2.5" fill="#111827"/>
      <rect x="36" y="26.5" width="2.5" height="2.5" fill="#111827"/>
      <rect x="33.5" y="26.5" width="1.5" height="1.5" fill="#111827"/>
    </svg>
  );
}

export default function BoxesPage() {
  const router = useRouter();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await db.boxes.orderBy('updatedAt').reverse().toArray();
      if (alive) {
        setBoxes(list);
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => boxes, [boxes]);

  if (loading) return <div>読み込み中...</div>;

  return (
    <main>
      <h2 className="page-title">箱リスト</h2>

      <ul className="box-list" aria-label="箱一覧">
        {rows.map((b) => (
          <li key={b.id} className="box-row">
            {/* 行本体は詳細へ。鉛筆は stopPropagation */}
            <button
              type="button"
              className="row-main"
              onClick={() => router.push(`/boxes/${b.id}`)}
              aria-label={`${b.name || b.code} の詳細へ`}
            >
              <div className="thumb">
                {b.thumbs?.length
                  ? <img src={b.thumbs[0]} alt="" />
                  : <BoxFallbackIcon />}
              </div>

              <div className="box-meta">
                <div className="name">{b.name || '（名称未設定）'}</div>
                <div className="sub">
                  <span className="code">{b.code}</span>
                  {b.location ? <span className="sep">・</span> : null}
                  {b.location ? <span className="location">{b.location}</span> : null}
                </div>
              </div>
            </button>

            <Link
              href={`/register?step=box&boxId=${b.id}`}
              className="edit-btn"
              aria-label="編集"
              onClick={(e) => e.stopPropagation()}
            >
              ✎
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
