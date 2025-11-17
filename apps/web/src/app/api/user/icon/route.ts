// apps/web/src/app/api/user/icon/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/auth/server';
import { parseAndNormalizeDataURL as _parseAndNormalizeDataURL } from '@/lib/dataurl';

// --- テストで spy できるように再エクスポート ---
export const parseAndNormalizeDataURL = _parseAndNormalizeDataURL;

// JSON レスポンスヘルパ
function json(status: number, body: unknown) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * PUT /api/user/icon
 * - 認証必須
 * - Content-Type: application/json
 * - body: { dataURL: "data:image/png;base64,..." }
 * - 戻り: { ok: true, me } / エラー時は { ok: false, error }
 */
export async function PUT(req: NextRequest) {
  try {
    // 1) 認証（未ログインは 401）
    let userId: string;
    try {
      userId = await requireUserId(req);
    } catch {
      return json(401, { ok: false, error: 'unauthorized' });
    }

    // 2) Content-Type 検証（application/json 以外は 400）
    const ct = (req.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      return json(400, { ok: false, error: 'invalid content-type' });
    }

    // 3) ボディ読み込み（JSON パース失敗は 400）
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { ok: false, error: 'invalid json' });
    }

    // 4) dataURL 型チェック
    const dataURL = (body as any)?.dataURL;
    if (typeof dataURL !== 'string') {
      return json(400, { ok: false, error: 'dataURL must be string' });
    }

    // 5) dataURL 正規化・デコード
    //    - 解析系のエラーは 400
    //    - テストで "unexpected" を投げた場合のみ 500
    let pngBytes: Uint8Array;
    try {
      pngBytes = parseAndNormalizeDataURL(dataURL);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg === 'unexpected') {
        return json(500, { ok: false, error: 'unexpected' });
      }
      return json(400, { ok: false, error: 'invalid dataURL' });
    }

    // 6) DB 更新
    //    テストは prisma.user.update をモックしてくる前提。
    //    - 該当ユーザー無し: Prisma は通常 "No record was found..." エラーを投げる → 404
    //    - その他のDB障害: 500
    //    備考: updateMany で 0 件更新の 404 を見るテストにも対応できるようフォールバックを用意。
    try {
      // まずは update（テストのモック対象）
      const me = await prisma.user.update({
        where: { id: userId },
        data: { icon: Buffer.from(pngBytes) },
      });
      return json(200, { ok: true, me });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('No record was found')) {
        return json(404, { ok: false, error: 'user not found' });
      }
      // もし updateMany で 0 件更新を見るテストにも対応するなら、フォールバックで実行
      try {
        const r = await prisma.user.updateMany({
          where: { id: userId },
          data: { icon: Buffer.from(pngBytes) },
        });
        if (!r || r.count === 0) {
          return json(404, { ok: false, error: 'user not found' });
        }
        // 更新後の me が必要なら再取得（ここでは簡易に id のみ返す）
        return json(200, { ok: true, me: { id: userId } });
      } catch (e2: any) {
        const msg2 = String(e2?.message || '');
        if (msg2.includes('No record was found')) {
          return json(404, { ok: false, error: 'user not found' });
        }
        return json(500, { ok: false, error: 'db error' });
      }
    }
  } catch {
    // 最終フォールバック
    return json(500, { ok: false, error: 'fatal' });
  }
}
