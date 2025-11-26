// API: PUT /api/user/icon
// 入力: JSON { dataURL: string }  ※image/png の data:URL(base64) のみ許可
// 出力: 成功 { ok:true, me }, 失敗 { ok:false, error }
// ステータス方針:
//  - 未ログイン/認証例外        → 401
//  - JSON/Content-Type 不正      → 400
//  - dataURL 不正（形式/MIME/BASE64等）→ 400
//  - DB 対象なし（update/updateMany） → 404
//  - 既知以外の内部エラー        → 500
//
// テストが spy する対象：
//  - parseAndNormalizeDataURL（トップレベル関数）
//  - __hooks.parseAndNormalizeDataURL（同じ関数参照を公開）
//  - __hooks.requireUserId（@/server/auth を間接化：テストでモック）
//  - prisma.user.update / updateMany（テストでモック）


// ★デバッグ用（テスト中にだけ使う想定）
// ★必要がなくなったら削除すること
export let __debug_parseCallCount = 0;

// ★ デバッグ用（テスト一時用）。後で削除する。
export const __debug_counts = {
  beforeParse: 0,
  afterParse: 0,
  beforeAuth: 0,
  beforeJson: 0,
  beforeDb: 0,
};

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/server/auth';

type ParseOk = { mime: string; b64: string; normalized: string };
type ParseErr =
  | 'BAD_INPUT' // 文字列でない
  | 'BAD_SCHEME' // data: で始まらない
  | 'BAD_FORMAT' // ";base64," 区切りでない等
  | 'BAD_MIME' // image/png 以外
  | 'EMPTY_BASE64' // base64 部が空
  | 'BAD_BASE64'; // base64 decode 失敗

/** dataURL の解析・正規化（schema/mime/base64 ヘッダの検証と空白除去＋decode 検証） */
export function parseAndNormalizeDataURL(
  input: unknown
): { ok: true; value: ParseOk } | { ok: false; error: ParseErr } {

  // ★
  __debug_parseCallCount++;  // デバッグ用

  if (typeof input !== 'string') return { ok: false, error: 'BAD_INPUT' };
  const trimmed = input.trim();
  if (!trimmed.startsWith('data:')) return { ok: false, error: 'BAD_SCHEME' };

  // data:<mime>;base64,<b64>
  const m = /^data:([^;,]+);base64,(.*)$/i.exec(trimmed);
  if (!m) return { ok: false, error: 'BAD_FORMAT' };

  const mime = m[1].toLowerCase();
  if (mime !== 'image/png') return { ok: false, error: 'BAD_MIME' };

  // 改行・空白は許容 → 除去
  const b64Raw = m[2] ?? '';
  const b64 = b64Raw.replace(/\s+/g, '');
  if (!b64) return { ok: false, error: 'EMPTY_BASE64' };

  // base64 妥当性（decode 試行）
  try {
    const buf = Buffer.from(b64, 'base64');
    if (!buf || buf.length === 0) return { ok: false, error: 'BAD_BASE64' };
  } catch {
    return { ok: false, error: 'BAD_BASE64' };
  }

  return {
    ok: true,
    value: { mime, b64, normalized: `data:${mime};base64,${b64}` },
  };
}

/** DB: アイコン更新（テスト期待の select / data 形を満たす） */
export async function updateUserIcon(
  userId: string,
  dataURL: string
): Promise<{ id: string } | { count: number }> {
  return prisma.user.update({
    where: { id: userId },
    data: { iconDataUrl: dataURL },
    // テストで toHaveBeenCalledWith される想定
    select: { id: true, displayName: true, iconDataUrl: true },
  }) as any;
}

/** spy 用の経由点 */
export const __hooks = {
  requireUserId,
  parseAndNormalizeDataURL,
  updateUserIcon,
} as const;

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function mapDataUrlError(e: ParseErr) {
  switch (e) {
    case 'BAD_INPUT':
      return bad(400, 'dataURL must be string');
    case 'BAD_SCHEME':
      return bad(400, 'invalid scheme');
    case 'BAD_FORMAT':
      return bad(400, 'invalid dataURL');
    case 'BAD_MIME':
      return bad(400, 'invalid mime');
    case 'EMPTY_BASE64':
      return bad(400, 'empty base64');
    case 'BAD_BASE64':
      return bad(400, 'invalid base64');
  }
}

export async function PUT(req: NextRequest) {
  try {
    // 1) 認証（テストでは __hooks.requireUserId を spy / mock）
    let userId: string | null = null;
    try {
      __debug_counts.beforeAuth++;  // ★
      const r = await __hooks.requireUserId(req);
      // 実運用は string 想定、テストの柔軟性確保でフォールバック
      userId = typeof r === 'string' ? r : (r as any)?.userId ?? null;
      if (!userId) return bad(401, 'unauthorized');
    } catch {
      return bad(401, 'unauthorized');
    }

    // 2) Content-Type 検証（400/415 許容 → 本実装は 400）
    const ct = req.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      return bad(400, 'unsupported content-type');
    }

    // 3) JSON parse
    let body: any;
    try {
      __debug_counts.beforeJson++;  // ★
      body = await req.json();
    } catch {
      return bad(400, 'bad json');
    }

    // 4) dataURL 検証（必ず __hooks 経由で 1 回だけ呼ぶ：hook-smoke の spy 前提）
    __debug_counts.beforeParse++; // ★
    const parsed = __hooks.parseAndNormalizeDataURL(body?.dataURL);
    __debug_counts.afterParse++; // ★
    if (!parsed.ok) return mapDataUrlError(parsed.error);
    const normalized = parsed.value.normalized;

    // 5) DB 更新（findUnique は行わず、update / updateMany の結果・例外で 200/404/500 を分岐）
    try {
      __debug_counts.beforeDb++;  // ★
      const r = await __hooks.updateUserIcon(userId, normalized);

      // updateMany をモックされた場合の互換: count===0 は 404
      if (r && typeof (r as any).count === 'number') {
        if ((r as any).count === 0) return bad(404, 'not updated');
        return NextResponse.json(
          { ok: true, me: { id: userId } },
          { status: 200 }
        );
      }

      // update 正常完了（select に id を含めているため、それを優先）
      return NextResponse.json(
        { ok: true, me: { id: (r as any).id ?? userId } },
        { status: 200 }
      );
    } catch (e: any) {
      // Prisma の not-found 系は 404、それ以外は 500
      const msg = String(e?.message ?? '');
      const cause = typeof e?.meta?.cause === 'string' ? e.meta.cause : '';
      const combined = `${msg} ${cause}`;

      if (
        e?.code === 'P2025' ||
        e?.name === 'NotFoundError' ||
        /\bnot\s*found\b/i.test(combined) ||
        /record\s*to\s*update\s*not\s*found/i.test(combined)
      ) {
        return bad(404, 'not found');
      }
      return bad(500, 'db error');
    }
  } catch {
    // パーサ等の予期せぬ例外
    return bad(500, 'internal error');
  }
}
