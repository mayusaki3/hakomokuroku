// API: PUT /api/user/icon
// 受領: JSON { dataURL: string }  ※image/png の data:URL(base64) のみ許可
// 返却: 成功 { ok:true, me }, 失敗 { ok:false, error }
// ステータス方針（テスト準拠）:
//  - 未ログイン/認証例外        → 401
//  - JSON/Content-Type 不正      → 400
//  - dataURL 不正（形式/MIME/BASE64等）→ 400
//  - DB 対象なし（find/update）  → 404
//  - 既知以外の内部エラー        → 500
//
// テストは下記を spy する:
//  - (mod as any).__hooks.parseAndNormalizeDataURL
//  - (mod as any).parseAndNormalizeDataURL
// そのため、両方に同一関数を公開する。

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Me = { id: string } & Record<string, unknown>;

type ParseOk = { mime: string; b64: string };
type ParseErr =
  | 'BAD_INPUT'   // 文字列でない
  | 'BAD_SCHEME'  // data: で始まらない
  | 'BAD_FORMAT'  // ";base64," 区切りでない等
  | 'BAD_MIME'    // image/png 以外
  | 'EMPTY_BASE64'// base64 部が空
  | 'BAD_BASE64'; // base64 decode 失敗
type ParseNg = { ok: false; code: ParseNgCode } | { ok: false; code: 'UNEXPECTED' };

// ============================ エクスポート関数（テストが spy する） ============================
export function parseAndNormalizeDataURL(input: unknown):
  | { ok: true; value: ParseOk }
  | { ok: false; error: ParseErr } {

  if (typeof input !== 'string') return { ok: false, error: 'BAD_INPUT' };
  if (!input.startsWith('data:')) return { ok: false, error: 'BAD_SCHEME' };

  // data:<mime>;base64,<b64>
  const m = input.match(/^data:([^;,]+);base64,(.*)$/i);
  if (!m) return { ok: false, error: 'BAD_FORMAT' };

  const mime = m[1].toLowerCase();
  if (mime !== 'image/png') return { ok: false, error: 'BAD_MIME' };

  // 改行・空白は許容 → 除去
  const b64 = (m[2] ?? '').replace(/\s+/g, '');
  if (!b64) return { ok: false, error: 'EMPTY_BASE64' };

  // Buffer.from が例外を投げても 400 に収める
  try {
    // 実際の decode はここで検証だけ（結果バイトは保存時に再生成でもOK）
    // decode が投げた場合を 400 にマップ
    // eslint-disable-next-line no-new
    Buffer.from(b64, 'base64');
  } catch {
    return { ok: false, error: 'BAD_BASE64' };
  }

  return { ok: true, value: { mime, b64 } };
}

// ============================ 外部差し替え可能なフック（テスト用） ============================
export const __hooks = {
  auth: async (): Promise<Me | null> => ({ id: 'U1' }),
  parseAndNormalizeDataURL, // テストが __hooks 経由でも spy できるよう公開
  findUserById: async (userId: string) =>
    prisma.user.findUnique({ where: { id: userId } }),
  // update は update / updateMany どちらでもテストできるよう抽象化
  updateUserIcon: async (userId: string, png: Buffer) =>
    prisma.user.update({ where: { id: userId }, data: { iconPng: png } }),
};

// ============================ ユーティリティ ============================
function isDbNotFound(err: any): boolean {
  const code = err?.code as string | undefined;
  const name = err?.name as string | undefined;
  const meta = err?.meta;
  const msg = String(err?.message ?? '');
  return (
    code === 'P2025' ||
    name === 'NotFoundError' ||
    /\bnot\s*found\b/i.test(msg) ||
    /record\s*to\s*update\s*not\s*found/i.test(msg) ||
    (typeof meta?.cause === 'string' && /\bnot\s*found\b/i.test(meta.cause)) ||
    /対象.*なし|該当.*なし|見つかりません/.test(msg)
  );
}

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

// ============================ ルート本体 ============================
export async function PUT(req: Request) {
  try {
    // 1) メソッド/Content-Type チェック → 不正なら 400/415
    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return bad(400, 'BAD_CONTENT_TYPE');

    // 2) JSON parse → 失敗なら 400
    let body: any;
    try {
      body = await req.json();
    } catch {
      return bad(400, 'BAD_JSON');
    }

    // 3) body.dataURL の存在/型チェック（string か）→ 不正なら 400
    if (!body || typeof body !== 'object' || !('dataURL' in body)) {
      return bad(400, 'BAD_INPUT');
    }

    // 4) dataURL 解析・正規化（schema/mime/base64 ヘッダ）→ 不正なら 400
    let parsed: ParseOk | ParseNg;
    try {
      parsed = __hooks.parseAndNormalizeDataURL(body.dataURL);
    } catch {
      // フック自体が throw → 500
      return bad(500, 'UNEXPECTED');
    }
    if (!parsed.ok) {
      if (parsed.code === 'UNEXPECTED') return bad(500, 'UNEXPECTED');
      // JPEGなど MIME 不一致も 400
      return bad(400, parsed.code);
    }

    // （後段へ移動予定）decode/保存は認証後に実施する
    let png!: Buffer; // Step 6 で代入

    // == 3) 認証チェック（ここで 401 に正規化）
    let me: Me | null = null;
    try {
      const session = await readSession(req);
      if (!session?.userId) return bad(401, 'NOT_AUTH');
      const user = await getUserById(session.userId);
      if (!user) return bad(401, 'NOT_AUTH');
      me = { id: user.id };
    } catch {
      return bad(401, 'NOT_AUTH');
    }
    
    // == 4) 対象ユーザー存在チェック（DB上）
    try {
      const target = await prisma.user.findFirst({ where: { id: me.id } });
      if (!target) return bad(404, 'USER_NOT_FOUND');
    } catch {
      return bad(400, 'BAD_REQUEST');
    }

    // 8) 対象ユーザーの存在確認
    if (!me?.id) {
      return bad(401, 'UNAUTHORIZED');
    }

    // 9) DB 保存（find 無し/更新0件は 404、DB例外は 500/503）
    try {
      const result = await __hooks.updateUserIcon(me.id, png);

      // updateMany 互換: { count: 0 } → 404
      if (result && typeof (result as any).count === 'number') {
        if ((result as any).count === 0) return bad(404, 'NOT_FOUND');
      }
      // update 互換: null/undefined → 404
      if (result == null) return bad(404, 'NOT_FOUND');
    } catch (err) {
      if (isDbNotFound(err)) return bad(404, 'NOT_FOUND');
      return bad(500, 'DB');
    }

    // 10) 成功応答 200
    return NextResponse.json({ ok: true, me }, { status: 200 });
  } catch {
    return bad(500, 'UNEXPECTED');
  }
}
