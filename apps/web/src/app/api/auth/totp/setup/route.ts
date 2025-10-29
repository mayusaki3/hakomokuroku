// Next.js App Router (route handler)
// 目的: TOTP セットアップ開始API（POST専用）
// 動作: ランダムなTOTP秘密鍵を生成 → DBに pending として暗号保存 → otpauth URL を返す
// 注意: GET は 405

import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import crypto from 'crypto';

// あなたの実装に合わせて調整（例：getCurrentUser はログインユーザーの {id, userId} を返す想定）
import { getCurrentUser } from '@/server/auth';
import { prisma } from '@/server/prisma';

// ---------- 暗号ユーティリティ ----------
// .env に Base64 の 32バイト鍵を設定: TOTP_SECRET_KEY=xxxxxxxx(base64)
const ENC_KEY_B64 = process.env.TOTP_SECRET_KEY ?? '';
function getKey(): Buffer {
  if (!ENC_KEY_B64) throw new Error('TOTP_SECRET_KEY is not set');
  const key = Buffer.from(ENC_KEY_B64, 'base64');
  if (key.length !== 32) throw new Error('TOTP_SECRET_KEY must be 32 bytes (Base64)');
  return key;
}

function encryptWithEnvKey(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // AES-GCM 標準
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // 保存は iv|tag|data を Base64 結合
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

// ---------- 405（未対応メソッド） ----------
export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}

// ---------- セットアップ開始 ----------
export async function POST() {
  // 1) ログインユーザー取得
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  // 2) 既に有効なら拒否（運用方針により許可して上書きでも可）
  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  if (user.totpEnabled) {
    return NextResponse.json({ ok: false, error: 'already enabled' }, { status: 400 });
  }

  // 3) 秘密鍵生成 → 暗号化して pending 保存
  const pendingSecret = authenticator.generateSecret();
  const pendingEnc = encryptWithEnvKey(pendingSecret);

  await prisma.user.update({
    where: { id: me.id },
    data: {
      totpPendingSecretEnc: pendingEnc,   // ← スキーマ名に合わせる
      totpPendingAt: new Date(),
      // 失敗カウントはリセットしておくと親切
      totpFailCount: 0,
    },
  });

  // 4) otpauth URL 生成
  // 表示ラベルは "Hakomokuroku: <userId>"
  const issuer = 'Hakomokuroku';
  const labelUserId = user.userId ?? 'user';
  const label = `${issuer}: ${labelUserId}`;
  // otplib の keyuri(accountName, issuer, secret)
  const otpauthUrl = authenticator.keyuri(label, issuer, pendingSecret);

  // 5) クライアントへ返却（QR生成はクライアントで実施）
  return NextResponse.json({ ok: true, otpauthUrl });
}
