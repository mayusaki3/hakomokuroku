// apps/web/src/server/totp.ts
/**
 * TOTP / RecoveryCode の共通ユーティリティ。
 *
 * 方針:
 * - ルート側は「入力検証」「HTTPレスポンス整形」を担う
 * - 本ファイルは「TOTP/Recovery の検証・生成・ハッシュ化」のみを担う
 * - export 名は一意（同名 export の重複禁止）
 */

import crypto from 'crypto';
import { authenticator } from 'otplib';
import { decryptStr } from '@/server/crypto';

// 安定化: ±1スライス許容（login/totp と同じ前提）
authenticator.options = { window: 1 };

/**
 * ルートから渡される user オブジェクトの最小形。
 * Prisma の User をそのまま渡しても良い。
 */
export type TotpUserLike = {
  totpSecretEnc?: string | null;
  totpPendingSecretEnc?: string | null;
  recoveryCodes?: unknown; // string[] 想定だが、null/undefined/型ブレを許容
};

/**
 * 6桁コード形式か（例: "123456"）
 */
export function isTotp6(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * SHA256(hex) ハッシュ化（recoveryCodes 保存形式）
 */
export function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * Recovery Code の生成（平文: "XXXX-XXXX"）
 */
export function generateRecoveryCodes(n: number): string[] {
  const one = () => {
    // A-Z0-9 のみ（見た目の均一性とコピー耐性優先）
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const pick = () => chars[crypto.randomInt(0, chars.length)];
    const s = Array.from({ length: 8 }, pick).join('');
    return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
  };

  const codes: string[] = [];
  for (let i = 0; i < n; i++) codes.push(one());
  return codes;
}

/**
 * TOTP（本番シークレット）検証
 * - user.totpSecretEnc が無ければ false
 */
export async function verifyTotpCode(user: TotpUserLike, code: string): Promise<boolean> {
  if (!user?.totpSecretEnc) return false;
  if (!isTotp6(code)) return false;

  const secret = await decryptStr(user.totpSecretEnc);
  return authenticator.check(code, secret);
}

/**
 * TOTP（セットアップ途中の pending secret）検証
 * - user.totpPendingSecretEnc が無ければ false
 */
export async function verifyTotpPendingCode(user: TotpUserLike, code: string): Promise<boolean> {
  if (!user?.totpPendingSecretEnc) return false;
  if (!isTotp6(code)) return false;

  const secret = await decryptStr(user.totpPendingSecretEnc);
  return authenticator.check(code, secret);
}

/**
 * Recovery Code 検証（存在確認のみ）
 * - 本関数は「一致したか」だけ返す（削除/更新はルート側で行う）
 */
export async function verifyRecoveryCode(
  user: TotpUserLike,
  recoveryCode: string,
): Promise<boolean> {
  const rc = typeof recoveryCode === 'string' ? recoveryCode.trim() : '';
  if (!rc) return false;

  const list = Array.isArray(user?.recoveryCodes) ? (user!.recoveryCodes as string[]) : [];
  if (list.length === 0) return false;

  const h = sha256Hex(rc);
  return list.some((x) => x === h);
}
