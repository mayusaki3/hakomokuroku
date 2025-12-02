'use client';
import Link from 'next/link';
import {
  Package as BoxIcon,
  PackageSearch as UnassignedIcon,
  Pencil as PencilIcon,
} from 'lucide-react';

type Props = {
  kind: 'box' | 'item';
  id: string;
  name: string;
  code?: string | null; // box のみ
  location?: string | null; // box のみ
  thumbUrl?: string | null;
  hrefDetail: string; // 行クリックのリンク
  hrefEdit: string; // 鉛筆アイコンのリンク
};

const UNASSIGNED_ID = 'UNASSIGNED';

export default function ListRow(p: Props) {
  const isUnassigned = p.kind === 'box' && (p.id === UNASSIGNED_ID || p.code === UNASSIGNED_ID);
  const Icon = isUnassigned ? UnassignedIcon : BoxIcon;

  return (
    <div className="grid grid-cols-[48px_1fr_auto] items-center gap-3 px-3 py-2 border-b">
      {/* サムネ/アイコン */}
      <Link href={p.hrefDetail} aria-label={`${p.name} の詳細へ`}>
        {p.thumbUrl ? (
          <img src={p.thumbUrl} alt="" className="h-10 w-10 rounded object-cover" />
        ) : (
          <Icon className="h-10 w-10 text-foreground/80" strokeWidth={1.5} aria-hidden />
        )}
      </Link>

      {/* テキスト */}
      <Link href={p.hrefDetail} className="min-w-0" aria-label={`${p.name} の詳細へ`}>
        <div className="font-medium truncate">{p.name}</div>
        <div className="text-sm text-muted-foreground flex gap-2">
          {/* 仮置き箱はコード非表示 */}
          {p.kind === 'box' && !isUnassigned && p.code && (
            <span className="font-mono truncate">{p.code}</span>
          )}
          {p.kind === 'box' && p.location && <span className="truncate">/ {p.location}</span>}
        </div>
      </Link>

      {/* 編集 */}
      <Link
        href={p.hrefEdit}
        aria-label={`${p.name} を編集`}
        className="p-2 rounded hover:bg-muted"
      >
        <PencilIcon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
      </Link>
    </div>
  );
}
