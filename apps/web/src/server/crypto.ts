// 共通のハッシュ/ユーティリティを集約
// 目的：発行時と照合時のハッシュ表現の不一致を防ぐ（hexで統一）

import crypto from 'node:crypto';

/** 任意文字列 → SHA-256(hex) */
export function sha256hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/** URLセーフな乱数文字列を生成（Cookieにそのまま入れる生トークン用） */
export function randomUrlSafe(len: number): string {
  return crypto
    .randomBytes(len)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/** デバッグ補助：生トークンから hex / base64url の両方を得る */
export function bothHashes(input: string) {
  const buf = crypto.createHash('sha256').update(input, 'utf8').digest();
  const hex = buf.toString('hex');
  const b64url = buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return { hex, b64url };
}

/** AES-256-GCM TOTP secret format: base64(iv[12] + tag[16] + ciphertext). */
export async function decryptStr(encoded: string): Promise<string> {
  const keyBase64 = process.env.TOTP_SECRET_KEY;
  if (!keyBase64) throw new Error('TOTP_SECRET_KEY is missing');
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('TOTP_SECRET_KEY must be 32 bytes');
  const payload = Buffer.from(encoded, 'base64');
  if (payload.length < 29) throw new Error('Invalid encrypted secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
}
