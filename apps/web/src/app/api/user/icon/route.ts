// apps/web/src/app/api/user/icon/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';

/**
 * ランタイムで識別可能な HTTP エラー型。
 * httpError(...) でのみ生成されることを保証し、
 * __isHttpError フラグで「自前のHTTPエラー」か判定する。
 */
type HttpError = Error & {
  status: number;
  __isHttpError: true;
};

/**
 * 指定ステータス付きの自前 HTTP エラーを生成して投げる。
 */
function httpError(status: number, message: string): never {
  const err = new Error(message) as HttpError;
  err.status = status;
  err.__isHttpError = true;
  throw err;
}

/**
 * Prisma の「対象レコードなし」エラー判定。
 * tests/api.user.icon.spec.ts の 404 ケースに対応。
 */
function isUserNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;

  if (
    typeof e.message === 'string' &&
    e.message.includes('No record was found for query on the database')
  ) {
    return true;
  }

  if (e.code === 'P2025') return true;
  if (e.name === 'NotFoundError') return true;

  return false;
}

/**
 * dataURL を検証し、「入力された dataURL 文字列そのもの」を返す。
 *
 * テスト要件:
 * - 正常ケースでは "data:image/png;base64,AAA" をそのまま DB に保存する。
 * - data: スキーム不正 / MIME 不正 / Base64 不正 などは 400。
 * - Base64 内の空白・改行は許容（検証時のみ除去して decode）。
 * - 想定外の例外はここでは握りつぶさずそのまま throw（外側で 500 にする）。
 */
export function parseAndNormalizeDataURL(dataURL: unknown): string {
  if (typeof dataURL !== 'string') {
    httpError(400, 'dataURL must be string');
  }

  if (!dataURL.startsWith('data:')) {
    httpError(400, 'invalid dataURL scheme');
  }

  const match = /^data:([^;,]+);base64,(.*)$/i.exec(dataURL);
  if (!match) {
    httpError(400, 'invalid dataURL format');
  }

  const mime = match[1].toLowerCase();
  const base64Raw = match[2];

  if (mime !== 'image/png') {
    httpError(400, 'unsupported mime type');
  }

  const base64Cleaned = base64Raw.replace(/\s+/g, '');
  if (!base64Cleaned) {
    httpError(400, 'empty data payload');
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(base64Cleaned, 'base64');
  } catch {
    httpError(400, 'failed to decode base64');
  }

  if (!buf.length) {
    httpError(400, 'failed to decode base64 (empty result)');
  }

  // 正常時は入力そのまま返す（テストはこの値を toHaveBeenCalledWith で検証）
  return dataURL;
}

/**
 * requireUserId の戻り値から userId を抽出。
 */
function extractUserId(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === 'string') {
    return value || null;
  }

  if (typeof value === 'object') {
    const v = value as any;
    if (v.ok && typeof v.userId === 'string') {
      return v.userId || null;
    }
  }

  return null;
}

/**
 * PUT /api/user/icon
 *
 * テスト仕様準拠:
 * - 未ログイン / 認証例外: 401 or 403 (実装は 401 固定)
 * - Content-Type 不正: 400/415 許容 (実装は 415)
 * - JSON 不正: 400
 * - dataURL 不正一式: 400
 * - Base64 改行・空白含む: 許容
 * - JPEG 等: 400
 * - DB 対象ユーザー無し: 404
 * - 予期せぬエラー: 500
 */
export async function PUT(req: Request): Promise<Response> {
  // 1. 認証
  let userId: string | null = null;
  try {
    const auth = await requireUserId();
    userId = extractUserId(auth);
  } catch (e: any) {
    const err = e as Partial<HttpError>;
    const status =
      err.__isHttpError && typeof err.status === 'number'
        ? err.status
        : 401;
    return NextResponse.json({ ok: false }, { status });
  }

  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // 2. 本体処理
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      httpError(415, 'unsupported content-type');
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      httpError(400, 'invalid json');
    }

    // ここはテストで spy 対象: export していることが重要
    const iconDataUrl = parseAndNormalizeDataURL(body?.dataURL);

    // 3. DB 更新
    let me;
    try {
      me = await prisma.user.update({
        where: { id: userId },
        data: { iconDataUrl },
        select: {
          id: true,
          displayName: true,
          iconDataUrl: true,
        },
      });
    } catch (e: any) {
      if (isUserNotFoundError(e)) {
        httpError(404, 'user not found');
      }
      // 404 以外の DB 例外は予期せぬエラーとして外側へ
      throw e;
    }

    return NextResponse.json({ ok: true, me }, { status: 200 });
  } catch (e: any) {
    const err = e as Partial<HttpError>;

    // 自前 httpError のみ指定ステータスを採用
    if (err.__isHttpError && typeof err.status === 'number') {
      return NextResponse.json({ ok: false }, { status: err.status });
    }

    // それ以外は全て「予期せぬエラー」として 500
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
