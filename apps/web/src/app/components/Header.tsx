'use client';

import React from 'react';
import { useMe } from '@/lib/authClient';

export default function Header() {
  const { me, isLoading, refresh } = useMe();

  return (
    <header className="flex items-center gap-3 p-2 border-b">
      <div className="font-bold">箱目録</div>
      <div className="ml-auto flex items-center gap-2">
        {!isLoading && me && (
          <>
            {/* Data URLは next/image でなく <img> が安全 */}
            {me.iconDataUrl ? (
              <img
                src={me.iconDataUrl}
                alt="icon"
                key={me.iconDataUrl}         // 変更時に強制再描画
                className="w-8 h-8 rounded-full border"
              />
            ) : (
              <div className="w-8 h-8 rounded-full border bg-gray-200" />
            )}
            <div className="text-sm">
              <div>ID: {me.userId}</div>
              <div>{me.userName ?? ''}</div>
            </div>
          </>
        )}
        <button className="text-xs underline" onClick={() => refresh()}>
          再読込
        </button>
      </div>
    </header>
  );
}
