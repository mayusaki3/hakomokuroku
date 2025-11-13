// apps/web/src/app/api/user/icon/route.ts
/**
 * 役割:
 * - /api/user/icon (PUT): ユーザーのアイコン(PNG base64)を保存し、{ ok:true, me } を返す
 *
 * テスト期待（apps/web/tests/api.user.icon.spec.ts 準拠）:
 * - 成功: 200 { ok:true, me }
 * - 未ログイン: 401 または 403
 * - Content-Type 不正/壊れJSON: 400（または 415）
 * - dataURL: "data:image/png;base64," のみ許可
 *   - JPEG など MIME 不正: 400（または 415）
 *   - base64 空・不正・decode 例外: 400
 *   - base64 の空白/改行は許容（除去）
 * - DB 更新失敗（例外）: 500（または 503）
 * - 対象ユーザー無/更新0件: 404
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';
import { requireUserId } from '@/server/auth';

const JSON_TYPE = /application\/json/i;
const DATAURL_PREFIX = 'data:image/png;base64,';

export async function PUT(req: Request) {
  // Content-Type
  const ct = req.headers.get('content-type') || '';
  if (!JSON_TYPE.test(ct)) {
    // 仕様上 400/415 どちらでも可 → 400 に寄せる
    return new NextResponse(JSON.stringify({ ok: false, error: 'invalid_content_type' }), { status: 400 });
  }

  // 認証
  let userId: string | null = null;
  try {
    userId = await requireUserId();
    if (!userId) {
      return new NextResponse(JSON.stringify({ ok: false, error: 'unauthenticated' }), { status: 401 });
    }
  } catch {
    // テストでは 401/403 どちらでも可 → 401 に寄せる
    return new NextResponse(JSON.stringify({ ok: false, error: 'unauthenticated' }), { status: 401 });
  }

  // JSON parse
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(JSON.stringify({ ok: false, error: 'bad_json' }), { status: 400 });
  }

  const dataURL = body?.dataURL;
  if (typeof dataURL !== 'string') {
    return new NextResponse(JSON.stringify({ ok: false, error: 'dataURL_required' }), { status: 400 });
  }

  // MIME と prefix 厳格チェック
  if (!dataURL.startsWith('data:')) {
    return new NextResponse(JSON.stringify({ ok: false, error: 'invalid_scheme' }), { status: 400 });
  }
  if (!dataURL.startsWith(DATAURL_PREFIX)) {
    // JPEG 等はここで弾く（テストは 400/415 どちらでもOK）
    return new NextResponse(JSON.stringify({ ok: false, error: 'invalid_mime' }), { status: 400 });
  }

  // base64 部抽出
  const base64 = dataURL.slice(DATAURL_PREFIX.length).replace(/\s+/g, ''); // 改行・空白を許容
  if (!base64) {
    return new NextResponse(JSON.stringify({ ok: false, error: 'empty_base64' }), { status: 400 });
  }

  // decode（例外は 400）
  let pngBuffer: Buffer;
  try {
    pngBuffer = Buffer.from(base64, 'base64');
    // 明らかに不正（長さ0や非base64結果）チェック
    if (!pngBuffer.length) throw new Error('decode_failed');
  } catch {
    return new NextResponse(JSON.stringify({ ok: false, error: 'invalid_base64' }), { status: 400 });
  }

  // DB 更新
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { iconPng: pngBuffer },
      select: { id: true, name: true, iconPng: true },
    });
    if (!updated) {
      return new NextResponse(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404 });
    }
    // 正常
    return NextResponse.json({ ok: true, me: updated }, { status: 200 });
  } catch (e: any) {
    // P2025 (Record not found) 等は 404
    const code = e?.code ?? e?.meta?.cause;
    if (code === 'P2025') {
      return new NextResponse(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404 });
    }
    // その他は 500 系
    return new NextResponse(JSON.stringify({ ok: false, error: 'db_error' }), { status: 500 });
  }
}

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { requireUserId } from '@/src/lib/auth/session';

/** 業務エラー: 400 を返すための軽量例外 */
class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

/**
 * dataURL を検証・正規化してデコード済みバイナリを返す
 * @param dataURL data:image/png;base64,.... 形式の文字列
 * @returns Uint8Array（PNGのバイト列）
 * @throws BadRequestError 入力不正（400系）
 * @throws Error 想定外の障害（500系）
 */
export function parseAndNormalizeDataURL(dataURL: string): Uint8Array {
  if (typeof dataURL !== 'string') {
    throw new BadRequestError('dataURL must be string');
  }
  if (!dataURL.startsWith('data:')) {
    throw new BadRequestError('scheme must be data:');
  }

  // data:[mime];base64,XXXX
  const comma = dataURL.indexOf(',');
  if (comma < 0) {
    throw new BadRequestError('dataURL missing comma');
  }
  const header = dataURL.substring(5, comma); // "image/png;base64" 等
  const payloadRaw = dataURL.substring(comma + 1);

  // MIME確認（image/png のみ許可）
  const mime = header.split(';')[0]?.trim().toLowerCase();
  if (mime !== 'image/png') {
    // テスト要件: text/plain / image/jpeg などは 400 とする
    throw new BadRequestError('unsupported mime');
  }

  // base64指定確認
  const isBase64 = header.toLowerCase().includes('base64');
  if (!isBase64) {
    throw new BadRequestError('must be base64');
  }

  // 改行や空白を除去して許容
  const payload = payloadRaw.replace(/\s+/g, '');
  if (!payload.length) {
    throw new BadRequestError('empty base64 payload');
  }

  try {
    // atob は Node では Buffer で代替
    const buf = Buffer.from(payload, 'base64');
    // base64 不正は長さ0や不正変換で判定（完全判定は再エンコード一致で担保）
    if (buf.length === 0 || Buffer.from(buf).toString('base64') !== payload) {
      throw new BadRequestError('invalid base64');
    }
    return new Uint8Array(buf);
  } catch (e: any) {
    if (e instanceof BadRequestError) throw e;
    // 予期せぬエラーは 500
    throw new Error('decode error');
  }
}

/**
 * 共通: JSONエラー応答
 */
function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}
