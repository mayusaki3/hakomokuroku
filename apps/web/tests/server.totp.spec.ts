// apps/web/tests/server.totp.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks ---
vi.mock('otplib', () => ({
  authenticator: {
    options: {},
    check: vi.fn(),
  },
}));

vi.mock('@/server/crypto', () => ({
  decryptStr: vi.fn(),
}));

import { authenticator } from 'otplib';
import { decryptStr } from '@/server/crypto';

// 対象
import {
  isTotp6,
  sha256Hex,
  generateRecoveryCodes,
  verifyTotpCode,
  verifyTotpPendingCode,
  verifyRecoveryCode,
  type TotpUserLike,
} from '@/server/totp';

describe('server/totp.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------
  // isTotp6
  // -------------------------
  it('isTotp6: 6桁のみ true', () => {
    expect(isTotp6('123456')).toBe(true);
    expect(isTotp6('000000')).toBe(true);

    expect(isTotp6('12345')).toBe(false);
    expect(isTotp6('1234567')).toBe(false);
    expect(isTotp6('12 3456')).toBe(false);
    expect(isTotp6('abcdef')).toBe(false);
  });

  // -------------------------
  // sha256Hex
  // -------------------------
  it('sha256Hex: 64文字 hex を返す（決定的）', () => {
    const h1 = sha256Hex('ABC-DEF');
    const h2 = sha256Hex('ABC-DEF');
    const h3 = sha256Hex('XYZ');

    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  // -------------------------
  // generateRecoveryCodes
  // -------------------------
  it('generateRecoveryCodes: n件、形式は XXXX-XXXX（A-Z0-9）', () => {
    const list = generateRecoveryCodes(10);
    expect(list).toHaveLength(10);

    for (const c of list) {
      expect(c).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    }
  });

  // -------------------------
  // verifyTotpCode
  // -------------------------
  it('verifyTotpCode: secret無し -> false（早期return）', async () => {
    const user: TotpUserLike = { totpSecretEnc: null };
    const ok = await verifyTotpCode(user, '123456');
    expect(ok).toBe(false);
    expect(decryptStr).not.toHaveBeenCalled();
    expect(authenticator.check).not.toHaveBeenCalled();
  });

  it('verifyTotpCode: code形式不正 -> false（早期return）', async () => {
    const user: TotpUserLike = { totpSecretEnc: 'enc' };
    const ok = await verifyTotpCode(user, '12345'); // 5桁
    expect(ok).toBe(false);
    expect(decryptStr).not.toHaveBeenCalled();
    expect(authenticator.check).not.toHaveBeenCalled();
  });

  it('verifyTotpCode: decrypt + check が呼ばれ、checkの戻り値を返す（true/false）', async () => {
    const user: TotpUserLike = { totpSecretEnc: 'enc' };

    vi.mocked(decryptStr).mockResolvedValueOnce('SECRET');
    vi.mocked(authenticator.check as any).mockReturnValueOnce(true);

    const ok1 = await verifyTotpCode(user, '123456');
    expect(ok1).toBe(true);
    expect(decryptStr).toHaveBeenCalledWith('enc');
    expect(authenticator.check).toHaveBeenCalledWith('123456', 'SECRET');

    vi.mocked(decryptStr).mockResolvedValueOnce('SECRET2');
    vi.mocked(authenticator.check as any).mockReturnValueOnce(false);

    const ok2 = await verifyTotpCode(user, '654321');
    expect(ok2).toBe(false);
    expect(decryptStr).toHaveBeenCalledWith('enc');
    expect(authenticator.check).toHaveBeenCalledWith('654321', 'SECRET2');
  });

  // -------------------------
  // verifyTotpPendingCode
  // -------------------------
  it('verifyTotpPendingCode: pending無し -> false（早期return）', async () => {
    const user: TotpUserLike = { totpPendingSecretEnc: undefined };
    const ok = await verifyTotpPendingCode(user, '123456');
    expect(ok).toBe(false);
    expect(decryptStr).not.toHaveBeenCalled();
    expect(authenticator.check).not.toHaveBeenCalled();
  });

  it('verifyTotpPendingCode: code形式不正 -> false（早期return）', async () => {
    const user: TotpUserLike = { totpPendingSecretEnc: 'enc-p' };
    const ok = await verifyTotpPendingCode(user, 'abc');
    expect(ok).toBe(false);
    expect(decryptStr).not.toHaveBeenCalled();
    expect(authenticator.check).not.toHaveBeenCalled();
  });

  it('verifyTotpPendingCode: decrypt + check が呼ばれ、checkの戻り値を返す', async () => {
    const user: TotpUserLike = { totpPendingSecretEnc: 'enc-p' };

    vi.mocked(decryptStr).mockResolvedValueOnce('PSECRET');
    vi.mocked(authenticator.check as any).mockReturnValueOnce(true);

    const ok = await verifyTotpPendingCode(user, '123456');
    expect(ok).toBe(true);
    expect(decryptStr).toHaveBeenCalledWith('enc-p');
    expect(authenticator.check).toHaveBeenCalledWith('123456', 'PSECRET');
  });

  // -------------------------
  // verifyRecoveryCode
  // -------------------------
  it('verifyRecoveryCode: 空/空白 -> false（早期return）', async () => {
    const user: TotpUserLike = { recoveryCodes: [] };
    expect(await verifyRecoveryCode(user, '')).toBe(false);
    expect(await verifyRecoveryCode(user, '   ')).toBe(false);
  });

  it('verifyRecoveryCode: recoveryCodes が配列でない -> false', async () => {
    const user: TotpUserLike = { recoveryCodes: null };
    const ok = await verifyRecoveryCode(user, 'ABCD-EFGH');
    expect(ok).toBe(false);
  });

  it('verifyRecoveryCode: recoveryCodes が空配列 -> false', async () => {
    const user: TotpUserLike = { recoveryCodes: [] };
    const ok = await verifyRecoveryCode(user, 'ABCD-EFGH');
    expect(ok).toBe(false);
  });

  it('verifyRecoveryCode: 不一致 -> false / 一致 -> true（sha256Hexを使った照合）', async () => {
    const rc = 'ABCD-EFGH';
    const h = sha256Hex(rc);

    const user1: TotpUserLike = { recoveryCodes: ['x'.repeat(64)] };
    expect(await verifyRecoveryCode(user1, rc)).toBe(false);

    const user2: TotpUserLike = { recoveryCodes: ['x'.repeat(64), h] };
    expect(await verifyRecoveryCode(user2, rc)).toBe(true);
  });

  it('verifyTotpPendingCode: secret empty -> false', async () => {
    const ok = await verifyTotpPendingCode(
        { totpPendingSecretEnc: '' } as any,
        '123456'
    );
    expect(ok).toBe(false);
  });

  it('verifyRecoveryCode: recoveryCode が string 以外 -> false（型ガード分岐）', async () => {
    const user: TotpUserLike = { recoveryCodes: ['dummyhash'] }; // 中身は何でも良い
    const ok = await verifyRecoveryCode(user, null as any);
    expect(ok).toBe(false);
  });
});
