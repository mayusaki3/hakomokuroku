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
