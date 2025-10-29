/**
 * パスワードハッシュ/検証ユーティリティ
 * 既定: argon2id
 * 互換: 旧DBに bcrypt が混在しても検証できるようフォールバック対応
 */
import argon2 from 'argon2';

// 任意: bcrypt 互換（依存が無ければ無視される）
let bcryptCompare: ((p: string, h: string) => Promise<boolean>) | null = null;
let bcryptHash: ((p: string) => Promise<string>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const bcrypt = await import('bcryptjs');
  bcryptCompare = (pwd: string, hash: string) => bcrypt.compare(pwd, hash);
  bcryptHash = (pwd: string) => bcrypt.hash(pwd, 10);
} catch {
  // bcrypt 未導入ならスキップ
}

/** 新規登録用: 平文→argon2id でハッシュ */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain) throw new Error('empty password');
  return argon2.hash(plain, { type: argon2.argon2id });
}

/** ログイン用: 平文とハッシュの一致判定（bcrypt も許容） */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;

  // bcrypt 系シグネチャは bcrypt で検証
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
    if (!bcryptCompare) return false;
    return bcryptCompare(plain, hash);
  }

  // 既定: argon2id
  try {
    return await argon2.verify(hash, plain, { type: argon2.argon2id });
  } catch {
    return false;
  }
}

// 参考: もし既存運用が bcrypt だった場合の移行用（未使用なら削除可）
export async function hashPasswordBcrypt(plain: string): Promise<string> {
  if (!bcryptHash) throw new Error('bcryptjs not installed');
  return bcryptHash(plain);
}
