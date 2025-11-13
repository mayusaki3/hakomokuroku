/**
 * /api/user/icon
 * - PUT: ユーザーのアイコン(PNG dataURL)を保存し、{ ok:true, me } を返す
 * テスト期待（apps/web/tests/api.user.icon.spec.ts 準拠）:
 * - dataURL を保存し、{ ok:true, me }（me は { id, displayName, iconDataUrl }）
 * - dataURL 未指定/不正は 400
 * - JPEG など mime 不正は 400
 * - Base64 に改行/空白があっても許容（正規化）
 * - Base64 部が空/不正は 400
 * - 未ログインは 401/403
 * - DB 更新 0 件（対象ユーザー無し）は 404
 * - 予期せぬ例外は 500
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { readSession } from '@/server/auth';
import { prisma } from '@/src/lib/prisma'; // テストはこの alias を前提に spy を組む

export const runtime = 'nodejs';
const headersNoStore = { 'Cache-Control': 'no-store' } as const;

/**
 * data:image/png;base64,XXXXX を検証しつつ正規化するユーティリティ。
 * - mime は image/png のみ許可
 * - Base64 部の空白/改行は除去
 * - decode 検証に失敗したらエラー
 */
function parseAndNormalizeDataURL(input: string): {
  normalized: string;
  mime: 'image/png';
  base64: string;
  size: number;
} {
  if (typeof input !== 'string') {
    throw Object.assign(new Error('dataURL must be string'), { status: 400 });
  }

  // 先頭のみチェック（余計なパラメータは不可）
  const m = /^data:(image\/png);base64,([\s\S]+)$/i.exec(input);
  if (!m) {
    // mime 不正 or 形式不正
    throw Object.assign(new Error('invalid dataURL or mime'), { status: 400 });
  }
  const mime = (m[1] as 'image/png');
  let b64 = m[2] ?? '';

  // 改行・空白を許容：すべて除去
  b64 = b64.replace(/\s+/g, '');
  if (!b64) {
    throw Object.assign(new Error('empty base64'), { status: 400 });
  }

  // Base64 decode の妥当性検証
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    throw Object.assign(new Error('invalid base64'), { status: 400 });
  }
  if (buf.length === 0) {
    throw Object.assign(new Error('invalid base64 (zero size)'), { status: 400 });
  }

  // 正規化した dataURL を生成
  const normalized = `data:${mime};base64,${b64}`;
  return { normalized, mime, base64: b64, size: buf.length };
}

// テストが spy できるよう公開（存在必須）
export const __hooks = { parseAndNormalizeDataURL };

export async function PUT(req: NextRequest) {
  try {
    // 認証
    const { user } = await readSession();
    if (!user) {
      // 401/403 のどちらでもテスト合格なので 401 を採用
      return NextResponse.json(
        { ok: false, error: 'unauthorized' },
        { status: 401, headers: headersNoStore },
      );
    }

    // Content-Type
    const ct = req.headers.get('content-type') || '';
    if (!/application\/json/i.test(ct)) {
      // 400/415 いずれも許容 → 415 を返す
      return NextResponse.json(
        { ok: false, error: 'unsupported content-type' },
        { status: 415, headers: headersNoStore },
      );
    }

    // JSON 解析
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'bad json' },
        { status: 400, headers: headersNoStore },
      );
    }

    // パラメータ取得
    const dataURL = (body as any)?.dataURL;
    if (typeof dataURL !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'dataURL required' },
        { status: 400, headers: headersNoStore },
      );
    }

    // dataURL 検証・正規化（ここをテストで spy する）
    const { normalized } = __hooks.parseAndNormalizeDataURL(dataURL);

    // 更新（0 件を 404 とするため updateMany を使う）
    const updated = await prisma.user.updateMany({
      where: { id: user.id },
      data: { iconDataUrl: normalized },
    });

    if (updated.count === 0) {
      // 対象ユーザー無し
      return NextResponse.json(
        { ok: false, error: 'user not found' },
        { status: 404, headers: headersNoStore },
      );
    }

    // 返却フィールドはテスト期待に合わせる
    const me = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        displayName: true,
        iconDataUrl: true,
      },
    });

    return NextResponse.json(
      { ok: true, me },
      { status: 200, headers: headersNoStore },
    );
  } catch (err: any) {
    // 既知のバリデーションエラー（status を持っている）はそのまま返す
    const status = typeof err?.status === 'number' ? err.status : 500;
    const msg = status === 500 ? 'internal error' : err?.message ?? 'error';
    return NextResponse.json(
      { ok: false, error: msg },
      { status, headers: headersNoStore },
    );
  }
}
