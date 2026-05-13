// apps/web/tests/api.settings.user.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { GET as GET_USER, PUT as PUT_USER } from '@/app/api/settings/user/route';
import { prisma } from '@/lib/prisma';
import { readSession } from '@/server/auth';

vi.mock('@/lib/prisma', () => {
  return {
    prisma: {
      user: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

vi.mock('@/server/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/auth')>();
  return {
    ...actual,
    readSession: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

const mockedReadSession = readSession as unknown as vi.Mock;
const mockedFindFirst = prisma.user.findFirst as unknown as vi.Mock;
const mockedUpdate = prisma.user.update as unknown as vi.Mock;

describe('GET /api/settings/user', () => {
  // sec_settings_user_get_success
  it('API_SETTINGS_USER-TC-01: ログイン中なら 200 + ok:true + user', async () => {
    mockedReadSession.mockResolvedValue({
      user: { id: 'U1' },
    });

    mockedFindFirst.mockResolvedValue({
      id: 'U1',
      userId: 'alice',
      userName: 'Alice',
      iconDataUrl: 'data:image/png;base64,xxx',
      totpEnabled: true,
      isActive: true,
    });

    const res = await GET_USER();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user).toEqual({
      id: 'U1',
      userId: 'alice',
      userName: 'Alice',
      iconDataUrl: 'data:image/png;base64,xxx',
      totpEnabled: true,
    });
  });

  // sec_settings_user_get_unauthorized
  it('API_SETTINGS_USER-TC-02: 未ログインなら 401', async () => {
    mockedReadSession.mockResolvedValue({ user: null });

    const res = await GET_USER();
    expect(res.status).toBe(401);
  });

  // sec_settings_user_get_db_error
  it('API_SETTINGS_USER-TC-03: DB 例外なら 500', async () => {
    mockedReadSession.mockResolvedValue({
      user: { id: 'U1' },
    });

    mockedFindFirst.mockRejectedValue(new Error('db error'));

    const res = await GET_USER();
    expect(res.status).toBe(500);
  });

  // sec_settings_user_get_not_found
  it('API_SETTINGS_USER-TC-04: セッションあり + DB ユーザーなしは 404', async () => {
    mockedReadSession.mockResolvedValue({
      user: { id: 'U1' },
    });

    mockedFindFirst.mockResolvedValue(null);

    const res = await GET_USER();

    expect(res.status).toBe(404);
    const body = await res.json();

    expect(body).toEqual({
      ok: false,
      user: null,
    });
  });

  // sec_settings_user_get_null_fields
  it('API_SETTINGS_USER-TC-05: userName / iconDataUrl が null でも 200 + ok:true + userName/iconDataUrl:null', async () => {
    mockedReadSession.mockResolvedValue({
      user: { id: 'U1' },
    });

    mockedFindFirst.mockResolvedValue({
      id: 'U1',
      userId: 'alice',
      userName: null,
      iconDataUrl: null,
      totpEnabled: false,
    });

    const res = await GET_USER();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user).toEqual({
      id: 'U1',
      userId: 'alice',
      userName: null,
      iconDataUrl: null,
      totpEnabled: false,
    });
  });
});

describe('PUT /api/settings/user', () => {
  // sec_settings_user_put_success
  it('API_SETTINGS_USER-TC-10: displayName を正常更新できる', async () => {
    mockedReadSession.mockResolvedValue({ user: { id: 'U1' } });
    mockedUpdate.mockResolvedValue({ id: 'U1' });

    const req = new Request('http://localhost/api/settings/user', {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Alice' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: 'U1' },
      data: { userName: 'Alice' },
    });
  });

  // sec_settings_user_put_validate_display_name
  it('API_SETTINGS_USER-TC-11: displayName 空文字は 400', async () => {
    mockedReadSession.mockResolvedValue({ user: { id: 'U1' } });

    const req = new Request('http://t.local/api/settings/user', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: '' }),
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(400);
  });

  // sec_settings_user_put_unauthorized
  it('API_SETTINGS_USER-TC-12: 未ログインは 401', async () => {
    mockedReadSession.mockResolvedValue({ user: null });

    const req = new Request('http://localhost/api/settings/user', {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Alice' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(401);

    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  // sec_settings_user_put_db_error
  it('API_SETTINGS_USER-TC-13: DB 更新例外は 500', async () => {
    mockedReadSession.mockResolvedValue({ user: { id: 'U1' } });
    mockedUpdate.mockRejectedValue(new Error('db error'));

    const req = new Request('http://localhost/api/settings/user', {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Alice' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PUT_USER(req);
    expect([500, 503]).toContain(res.status);
  });

  // sec_settings_user_put_validate_display_name
  it('API_SETTINGS_USER-TC-14: displayName 未指定は 400', async () => {
    mockedReadSession.mockResolvedValue({ user: { id: 'U1' } });

    const req = new Request('http://t.local/api/settings/user', {
      method: 'PUT',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(400);

    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  // sec_settings_user_put_parse_body
  it('API_SETTINGS_USER-TC-15: JSON パースエラーなら 400', async () => {
    mockedReadSession.mockResolvedValue({ user: { id: 'U1' } });

    const req = new Request('http://t.local/api/settings/user', {
      method: 'PUT',
      body: '{ invalid-json',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toBe('displayName is required');
  });

  // sec_settings_user_put_validate_display_name
  it('API_SETTINGS_USER-TC-16: displayName が空白のみなら 400', async () => {
    mockedReadSession.mockResolvedValue({ user: { id: 'U1' } });

    const req = new Request('http://t.local/api/settings/user', {
      method: 'PUT',
      body: JSON.stringify({ displayName: '    ' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(400);

    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  // sec_settings_user_put_validate_display_name
  it('API_SETTINGS_USER-TC-17: displayName が string 以外なら 400', async () => {
    mockedReadSession.mockResolvedValue({ user: { id: 'U1' } });

    const req = new Request('http://t.local/api/settings/user', {
      method: 'PUT',
      body: JSON.stringify({ displayName: 12345 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PUT_USER(req);
    expect(res.status).toBe(400);

    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
