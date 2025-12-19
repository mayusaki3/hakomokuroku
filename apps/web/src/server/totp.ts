// apps/web/src/server/totp.ts
// TOTP/リカバリコード検証の共通関数。
// route から import し、テストでは vi.mock('@/server/totp') で差し替える。

export type TotpUserLike = {
  totpSecretEnc: string | null;
  recoveryCodes: any; // 実型は実装に合わせる（JSON配列など）
};

/**
 * TOTP コードを検証する。
 * @param user ユーザー（totpSecretEnc を含む）
 * @param code 6桁数字
 * @returns 検証成功なら true
 */
export async function verifyTotpCode(_user: TotpUserLike, _code: string): Promise<boolean> {
  // TODO: 実装（復号 + TOTP 検証）を入れる
  // いったん false 固定にして、テストではモックして期待値を制御する
  return false;
}

/**
 * リカバリコードを検証する。
 * @param user ユーザー（recoveryCodes を含む）
 * @param recoveryCode 平文
 * @returns 検証成功なら true
 */
export async function verifyRecoveryCode(_user: TotpUserLike, _recoveryCode: string): Promise<boolean> {
  // TODO: 実装（ハッシュ照合など）を入れる
  return false;
}

// apps/web/src/server/totp.ts

export type TotpUserLike = {
  totpSecretEnc: string | null;
  totpPendingSecretEnc?: string | null;
  recoveryCodes: any;
};

export async function verifyTotpCode(_user: TotpUserLike, _code: string): Promise<boolean> {
  return false;
}

export async function verifyRecoveryCode(_user: TotpUserLike, _recoveryCode: string): Promise<boolean> {
  return false;
}

/**
 * pending 秘密鍵（totpPendingSecretEnc）で TOTP code を検証する。
 * route から呼び、テストでは vi.mock('@/server/totp') で差し替える。
 */
export async function verifyTotpPendingCode(_user: TotpUserLike, _code: string): Promise<boolean> {
  // TODO: decrypt + otplib.verify を実装
  return false;
}

/**
 * リカバリコードを新規生成する。
 * route から呼び、テストでは vi.mock('@/server/totp') で差し替える。
 */
export function generateRecoveryCodes(_n = 10): string[] {
  // TODO: 実装（乱数生成 + 形式）
  return [];
}
