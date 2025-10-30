// apps/web/src/server/password.ts
// パスワードハッシュ・検証の薄いラッパ。
// 既に argon2 等の実装が別にある場合は、ここで呼び出すように統一。

import argon2 from 'argon2';

// ハッシュ化（argon2idデフォルト想定）
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

// 検証
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
