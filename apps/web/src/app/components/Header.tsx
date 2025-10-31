'use client';

import React, { useMemo } from 'react';
import { useMe } from '@/lib/authClient';

// 未ログイン時に遷移させる先
const LOGIN_PATH = '/settings/user';

// 右側の操作ボタン（PC表示）
const OPS = [
  { label: '箱一覧', href: '/boxes' },
  { label: 'アイテム登録', href: '/items/new' },
  { label: '設定', href: '/settings/user' },
];

// 既定ユーザーアイコン
function DefaultUserIcon() {
  return (
    <div
      className="h-9 w-9 shrink-0 rounded-full border bg-gray-100"
      aria-label="デフォルトユーザーアイコン"
    />
  );
}

// ユーザーアイコン
function UserIcon({ src }: { src: string | null | undefined }) {
  if (!src) return <DefaultUserIcon />;
  return (
    <img
      src={src}
      alt="user icon"
      className="h-9 w-9 shrink-0 rounded-full border object-cover"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}

// アプリのアイコン＋タイトル（常に中央）
function AppBranding() {
  return (
    <a
      href="/"
      className="
        absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
        flex items-center gap-2 no-underline
      "
      aria-label="ホーム"
    >
      <div className="h-5 w-5 shrink-0 rounded-sm border bg-amber-200" />
      <div className="select-none text-sm font-semibold tracking-wide text-gray-900">
        箱目録
      </div>
    </a>
  );
}

export default function Header() {
  const { me } = useMe();
  const isAuthed = !!me;

  // 未ログイン時は全ボタンをログイン導線へ
  const opsForRender = useMemo(() => {
    if (isAuthed) return OPS;
    return OPS.map((o) => ({ ...o, href: LOGIN_PATH }));
  }, [isAuthed]);

  return (
    <header
      className="sticky top-0 z-50 h-14 w-full border-b bg-white/95 backdrop-blur"
      role="banner"
    >
      {/* relative で中央absoluteを安定化、行高固定 */}
      <div className="relative mx-auto flex h-full max-w-screen-xl items-center px-3">
        {/* 左：ユーザーアイコン */}
        <div className="flex min-w-0 items-center gap-2">
          <UserIcon src={isAuthed ? me!.iconDataUrl : null} />
        </div>

        {/* 中央：アプリのアイコン＋タイトル */}
        <AppBranding />

        {/* 右：操作ボタン（PCで表示、モバイルは非表示） */}
        <nav className="ml-auto hidden items-center gap-2 sm:flex">
          {opsForRender.map((op) => (
            <a
              key={op.label}
              href={op.href}
              className="inline-flex h-8 items-center justify-center rounded border px-2 text-xs text-gray-900 hover:bg-gray-50 active:bg-gray-100"
            >
              {op.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
