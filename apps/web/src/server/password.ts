// パスワード検証ユーティリティ
// schema.prisma のコメント通り argon2id を既定とする
// 互換: もし既存DBに bcrypt ($2b$...) が混在しても比較できるようフォールバック

import argon2 from 'argon2';

// オプション: bcrypt併用環境向け（未使用なら削除可）
let bcryptCompare: ((p: string, h: string) => Promise<boolean>) | null = null;
try {
  // 動的importで依存を強制しない
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const bcrypt = await import('bcryptjs');
  bcryptCompare = (pwd: string, hash: string) => bcrypt.compare(pwd, hash);
} catch {
  // bcryptjs 未導入なら無視
}

/** 平文とハッシュの一致判定 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;

  // bcrypt の判定子であれば bcrypt へ
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
