import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** A device credential is independent of the public deviceId and login cookie. */
export function createDeviceCredential(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDeviceCredential(credential: string): string {
  return createHash('sha256').update(credential).digest('hex');
}

/** Compare stored hashes in constant time; reject malformed values. */
export function verifyDeviceCredential(credential: string, storedHash: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(credential) || !/^[a-f0-9]{64}$/.test(storedHash)) {
    return false;
  }
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashDeviceCredential(credential), 'hex');
  return timingSafeEqual(actual, expected);
}
