import { NextResponse } from 'next/server';
import { readSession } from '@/server/auth';

// Prisma を使うため Node.js ランタイムで実行
export const runtime = 'nodejs';

// sec_auth_me_no_store
// このエンドポイントは個人差分のためキャッシュしない
const headersNoStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    // sec_auth_me_session_read
    const { user } = await readSession();

    // sec_auth_me_logged_in
    // sec_auth_me_not_logged_in
    // 未ログイン・無効化・セッション切れは user:null
    return NextResponse.json({ ok: !!user, user }, { headers: headersNoStore });
  } catch (err) {
    // sec_auth_me_read_error
    // ユーザーには概要のみ（user:null）。詳細はサーバーログに残す。
    console.error('GET /api/auth/me failed', err);

    return NextResponse.json(
      { ok: false, user: null },
      { headers: headersNoStore },
    );
  }
}
