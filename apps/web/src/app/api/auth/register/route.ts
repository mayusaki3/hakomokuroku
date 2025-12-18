import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import argon2 from 'argon2';

export async function POST(req: Request) {
  // Content-Type チェック（必須）
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  // JSON パース
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const { userId, password } = body ?? {};

  // userId は trim して扱う（保存も trim）
  const userIdTrimmed = typeof userId === 'string' ? userId.trim() : userId;

  // 入力検証（仕様：厳密なメール形式チェックはしないが、必須・型は見る）
  if (typeof userIdTrimmed !== 'string' || userIdTrimmed.length === 0) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  try {
    // 既存確認（テスト仕様：findFirst）
    const exists = await prisma.user.findFirst({ where: { userId: userIdTrimmed } });
    if (exists) {
      return NextResponse.json({ ok: false, error: 'already_exists' }, { status: 409 });
    }

    const passwordHash = await argon2.hash(password);

    await prisma.user.create({
      data: {
        userId: userIdTrimmed,
        passwordHash,
      },
    });

    // 成功：200 + {ok:true}（ログイン状態にはしない）
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    // 仕様：既定エラー応答に委ねる、がテスト容易性のため 500 を返してもOK
    return new NextResponse(null, { status: 500 });
  }
}
