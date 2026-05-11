import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import argon2 from 'argon2';

export async function POST(req: Request) {
  // sec_auth_register_invalid_request
  // Content-Type チェック（必須）
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  // sec_auth_register_invalid_request
  // JSON パース
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const { userId, password } = body ?? {};

  // sec_auth_register_security
  // userId は trim して扱う（保存も trim）
  const userIdTrimmed = typeof userId === 'string' ? userId.trim() : userId;

  // sec_auth_register_invalid_request
  // 入力検証
  if (typeof userIdTrimmed !== 'string' || userIdTrimmed.length === 0) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  // sec_auth_register_invalid_request
  // 入力検証
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  try {
    // sec_auth_register_conflict
    // 既存確認（テスト仕様：findFirst）
    const exists = await prisma.user.findFirst({ where: { userId: userIdTrimmed } });
    if (exists) {
      return NextResponse.json({ ok: false, error: 'already_exists' }, { status: 409 });
    }

    // sec_auth_register_security
    // password hash 化
    const passwordHash = await argon2.hash(password);

    // sec_auth_register_success
    // User 作成
    await prisma.user.create({
      data: {
        userId: userIdTrimmed,
        passwordHash,
      },
    });

    // sec_auth_register_success
    // 成功：200 + {ok:true}（ログイン状態にはしない）
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    // sec_auth_register_internal_error
    // DB / Prisma 例外
    return new NextResponse(null, { status: 500 });
  }
}
