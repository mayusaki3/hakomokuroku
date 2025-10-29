// Next.js App Router (route handler)
// 目的: TOTP セットアップ検証API（POST）
// 動作: DBの pending 秘密鍵を復号 → 入力コードを検証 → 成功時に本採用+recoveryCodes作成
// 注意: GET は 405

import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import crypto from 'crypto';

import { getCurrentUser } from '@/server/auth';
import { prisma } from '@/server/prisma';

// ---------- 暗号ユーティリティ（setup と同一実装） ----------
const ENC_KEY_B64 = process.env.TOTP_SECRET_KEY ?? '';
function getKey(): Buffer {
  if (!ENC_KEY_B64) throw new Error('TOTP_SECRET_KEY is not set');
  const key = Buffer.from(ENC_KEY_B64, 'base64');
  if (key.length !== 32) throw new Error('TOTP_SECRET_KEY must be 32 bytes (Base64)');
  return key;
}

function decryptWithEnvKey(b64: string): string {
  const key = getKey();
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const dec = crypto.createDecipheriv('aes-256-gcm', key, iv);
  dec.setAuthTag(tag);
  const out = Buffer.concat([dec.update(data), dec.final()]);
  return out.toString('utf8');
}

// ---------- 補助: リカバリーコード生成 ----------
function makeRecoveryCodes(n = 10): string[] {
  // 10本の英数字8桁（重複可）を生成。運用に合わせて一意性担保や形式変更可
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    codes.push(crypto.randomBytes(6).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 8));
  }
  return codes;
}

// ---------- 405 ----------
export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

// ---------- 検証 ----------
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  // 入力: { code: "123456" }
  let code: string | undefined;
  try {
    const body = await req.json();
    code = typeof body?.code === 'string' ? body.code.trim() : undefined;
  } catch {
    return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 });
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: 'invalid code' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

  // pending が無ければエラー（setup 未実行）
  if (!user.totpPendingSecretEnc) {
    return NextResponse.json({ ok: false, error: 'setup not started' }, { status: 400 });
  }

  // 復号 → 検証
  const pendingSecret = decryptWithEnvKey(user.totpPendingSecretEnc);
  const isValid = authenticator.verify({ token: code, secret: pendingSecret });

  if (!isValid) {
    // 任意: 失敗カウントを加算してレート制御
    await prisma.user.update({
      where: { id: me.id },
      data: { totpFailCount: (user.totpFailCount ?? 0) + 1 },
    });
    return NextResponse.json({ ok: false, error: '確認に失敗しました' }, { status: 400 });
  }

  // 成功: 本採用
  const recoveryCodes = makeRecoveryCodes(10);
  await prisma.user.update({
    where: { id: me.id },
    data: {
      totpEnabled: true,
      // 本採用: 本番用に pending を移送
      totpSecretEnc: user.totpPendingSecretEnc,
      // pending 項目はクリア
      totpPendingSecretEnc: null,
      totpPendingAt: null,
      // 失敗カウント初期化
      totpFailCount: 0,
      // 回復コード保存（JSON列を想定）
      recoveryCodes,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, recoveryCodes });
}
