import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  bind: vi.fn(),
}));
vi.mock('@/server/device-registration', () => ({ registerOrResumeDevice: mocks.register }));
vi.mock('@/server/session-device', () => ({ bindSessionDevice: mocks.bind }));
import { attachLoginDevice, readDeviceCookie, deviceCookieOptions } from '@/server/device-login';

describe('Device login association', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.register.mockResolvedValue({ deviceId: 'new-device', credential: 'secret', created: true });
    mocks.bind.mockResolvedValue(true);
  });

  it('registers and binds a device after authentication', async () => {
    const req = new Request('http://localhost');
    expect(await attachLoginDevice('user-a', 'session-a', req)).toBe('new-device.secret');
    expect(mocks.register).toHaveBeenCalledWith('user-a', undefined, undefined);
    expect(mocks.bind).toHaveBeenCalledWith('user-a', 'session-a', 'new-device');
  });

  it('passes an existing cookie only as a candidate for server verification', async () => {
    const deviceId = '11111111-1111-4111-8111-111111111111';
    const credential = 'A'.repeat(43);
    const req = new Request('http://localhost', { headers: { cookie: 'hk_device=' + deviceId + '.' + credential } });
    expect(readDeviceCookie(req)).toEqual({ deviceId, credential });
    await attachLoginDevice('user-a', 'session-a', req);
    expect(mocks.register).toHaveBeenCalledWith('user-a', deviceId, credential);
  });

  it('rejects malformed cookie values', () => {
    expect(readDeviceCookie(new Request('http://localhost', { headers: { cookie: 'hk_device=bad' } }))).toBeNull();
  });

  it('fails rather than issuing a cookie if session binding fails', async () => {
    mocks.bind.mockResolvedValue(false);
    await expect(attachLoginDevice('user-a', 'session-a', new Request('http://localhost')))
      .rejects.toThrow('DEVICE_SESSION_BIND_FAILED');
  });

  it('uses HttpOnly and production-only Secure cookies', () => {
    expect(deviceCookieOptions().httpOnly).toBe(true);
    expect(deviceCookieOptions().sameSite).toBe('lax');
    expect(deviceCookieOptions().path).toBe('/');
  });
});
