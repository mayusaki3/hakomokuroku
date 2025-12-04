// API: PUT /api/user/icon
// 入力: JSON { icon: string }  ※image/png の data:URL(base64) のみ許可（後方互換で dataURL も許容）
// 出力: 成功 { ok:true, me }, 失敗 { ok:false, error }
// ステータス方針:
//  - 未ログイン/認証例外                → 401
//  - JSON/Content-Type 不正              → 400
//  - dataURL 不正（形式/MIME/BASE64等） → 400
//  - DB 対象なし（update/updateMany）   → 404
//  - 既知以外の内部エラー              → 500
//
// テストが spy する対象：
//  - parseAndNormalizeDataURL（トップレベル関数）
//  - __hooks.parseAndNormalizeDataURL（同じ関数参照を公開）
//  - __hooks.requireUserId（@/server/auth を間接化：テストでモック）
//  - prisma.user.update / updateMany（テストでモック）

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
  // 入力は文字列必須
  if (typeof input !== 'string') return { ok: false, error: 'BAD_INPUT' };

  const trimmed = input.trim();
  if (!trimmed.startsWith('data:')) return { ok: false, error: 'BAD_SCHEME' };

  // data:<mime>;base64,<b64>
  // ※ 改行・空白を含む Base64 を許容するため、(.*) → ([\s\S]*) に変更
  const m = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(trimmed);
  if (!m) return { ok: false, error: 'BAD_FORMAT' };

  const mime = m[1].toLowerCase();
  if (mime !== 'image/png') return { ok: false, error: 'BAD_MIME' };

  // 改行・空白は許容 → 除去
  const b64Raw = m[2];
  const b64 = b64Raw.replace(/\s+/g, '');
  if (!b64) return { ok: false, error: 'EMPTY_BASE64' };

  // Base64 文字種の簡易検証（@@@ 等の明らかな不正を弾く）
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    return { ok: false, error: 'BAD_BASE64' };
  }

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
): Promise<{ id: string; iconDataUrl?: string } | { count: number }> {
  return prisma.user.update({
    where: { id: userId },
    data: { iconDataUrl: dataURL },
    // テストで toHaveBeenCalledWith / select 内容を確認する想定
    select: { id: true, displayName: true, iconDataUrl: true },
  }) as any;
}

/** spy 用の経由点 */
export const __hooks = {
  requireUserId,
  parseAndNormalizeDataURL,
  updateUserIcon,
} as const;

/** エラーレスポンス共通生成 */
function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** dataURL パースエラー → HTTPエラーへのマッピング */
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
      const r = await __hooks.requireUserId(req);
      userId = typeof r === 'string' ? r : ((r as any)?.userId ?? null);
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
      body = await req.json();
    } catch {
      return bad(400, 'bad json');
    }

    // 4) dataURL 検証
    // 仕様上は icon を正としつつ、後方互換で dataURL も許可する
    let rawInput: unknown = body?.icon;
    if (rawInput == null || (typeof rawInput === 'string' && rawInput.trim() === '')) {
      rawInput = body?.dataURL;
    }

    const parsed = __hooks.parseAndNormalizeDataURL(rawInput);
    if (!parsed.ok) return mapDataUrlError(parsed.error);
    const normalized = parsed.value.normalized;

    // 5) DB 更新（update / updateMany の結果・例外で 200/404/500 を分岐）
    try {
      const r = await __hooks.updateUserIcon(userId, normalized);

      // updateUserIcon が null/undefined を返した場合の安全弁
      if (!r) {
        return bad(500, 'internal_error');
      }

      // updateMany をモックされた場合の互換: count===0 は 404
      if (typeof (r as any).count === 'number') {
        if ((r as any).count === 0) return bad(404, 'not_found');
      }

      // update 正常完了（select に id / iconDataUrl を含めているため、それを優先）
      const id = (r as any).id ?? userId;
      const iconDataUrl = (r as any).iconDataUrl ?? normalized;

      return NextResponse.json(
        {
          ok: true,
          me: {
            id,
            // テスト仕様：「me.iconUrl（またはそれに相当するフィールド）が更新されている」
            // 値自体は実装依存なので、ここでは dataURL をそのまま返す
            iconUrl: iconDataUrl,
          },
        },
        { status: 200 }
      );
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      const cause = typeof e?.meta?.cause === 'string' ? e.meta.cause : '';
      const combined = `${msg} ${cause}`;

      // not-found 系は 404 + error:not_found
      if (e?.code === 'P2025' || e?.name === 'NotFoundError' || /\bnot\s*found\b/i.test(combined)) {
        return bad(404, 'not_found');
      }

      // その他 DB エラーは 500 + error:internal_error
      return bad(500, 'internal_error');
    }
  } catch {
    // パーサ等の予期せぬ例外
    return bad(500, 'internal_error');
  }
}
