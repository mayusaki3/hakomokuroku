import { registerOrResumeDevice } from '@/server/device-registration';
import { bindSessionDevice } from '@/server/session-device';

export const DEVICE_COOKIE = 'hk_device';
const DEVICE_SECONDS = 365 * 24 * 60 * 60;

export function deviceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DEVICE_SECONDS,
  };
}

export function readDeviceCookie(req: Request): { deviceId: string; credential: string } | null {
  const raw = req.headers.get('cookie')?.split(';').map(v => v.trim())
    .find(v => v.startsWith(DEVICE_COOKIE + '='))?.slice(DEVICE_COOKIE.length + 1);
  if (!raw) return null;
  const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(raw);
  return match ? { deviceId: match[1], credential: match[2] } : null;
}

/** Only call after all authentication factors have succeeded. */
export async function attachLoginDevice(userId: string, sessionId: string, req: Request) {
  const previous = readDeviceCookie(req);
  const device = await registerOrResumeDevice(userId, previous?.deviceId, previous?.credential);
  const attached = await bindSessionDevice(userId, sessionId, device.deviceId);
  if (!attached) throw new Error('DEVICE_SESSION_BIND_FAILED');
  return device.deviceId + '.' + device.credential;
}
