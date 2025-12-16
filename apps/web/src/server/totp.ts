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
