import { describe, expect, it } from 'vitest';
import {
  createDeviceCredential,
  hashDeviceCredential,
  verifyDeviceCredential,
} from '@/server/device-credential';

describe('Device credential', () => {
  it('generates distinct high-entropy credentials and hashes instead of storing plaintext', () => {
    const a = createDeviceCredential();
    const b = createDeviceCredential();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(b).not.toBe(a);
    expect(hashDeviceCredential(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDeviceCredential(a)).not.toBe(a);
    expect(hashDeviceCredential(a)).toBe(hashDeviceCredential(a));
  });

  it('accepts only the matching credential', () => {
    const credential = createDeviceCredential();
    const hash = hashDeviceCredential(credential);
    expect(verifyDeviceCredential(credential, hash)).toBe(true);
    expect(verifyDeviceCredential(createDeviceCredential(), hash)).toBe(false);
    expect(verifyDeviceCredential('', hash)).toBe(false);
    expect(verifyDeviceCredential(credential, 'invalid')).toBe(false);
  });
});
