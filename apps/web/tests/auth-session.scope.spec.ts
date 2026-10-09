import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ requireUserId: vi.fn(), update: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireUserId: m.requireUserId }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { update: m.update } } }));
vi.mock('@/lib/db', () => ({ prisma: { user: { update: m.update } } }));

import { PUT as profile } from '@/app/api/user/profile/route';
import { PUT as icon } from '@/app/api/user/icon/route';

function req(path: string, body: object) {
  return new Request('http://localhost' + path, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as Parameters<typeof profile>[0];
}

describe('AUTH-S10: profile and icon changes are session-user scoped', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.requireUserId.mockResolvedValue('owner-id');
    m.update.mockResolvedValue({ id: 'owner-id', iconDataUrl: 'data:image/png;base64,YQ==' });
  });

  it('rejects unauthenticated profile and icon changes', async () => {
    m.requireUserId.mockRejectedValue(new Error('UNAUTHORIZED'));
    expect((await profile(req('/api/user/profile', { userName: 'changed' }))).status).toBe(401);
    expect((await icon(req('/api/user/icon', { icon: 'data:image/png;base64,YQ==' }))).status).toBe(401);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('updates only the authenticated user profile', async () => {
    const res = await profile(req('/api/user/profile', { userName: 'changed', userId: 'other-id' }));
    expect(res.status).toBe(200);
    expect(m.update).toHaveBeenCalledWith({
      where: { id: 'owner-id' }, data: { userName: 'changed' },
    });
  });

  it('updates only the authenticated user icon', async () => {
    const res = await icon(req('/api/user/icon', {
      icon: 'data:image/png;base64,YQ==', userId: 'other-id',
    }));
    expect(res.status).toBe(200);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'owner-id' }, data: { iconDataUrl: 'data:image/png;base64,YQ==' },
    }));
  });

  it('does not confuse AuthSession with Device identity', async () => {
    const res = await profile(req('/api/user/profile', { deviceName: 'other device' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'device_scope_required' });
    expect(m.update).not.toHaveBeenCalled();
  });
});
