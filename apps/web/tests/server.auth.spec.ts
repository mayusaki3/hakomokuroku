import { describe, it, expect, vi, beforeEach } from 'vitest';

// next/headers の cookies をモック
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { cookies } from 'next/headers';
import { getUser, requireUserId } from '@/server/auth';

const mockedCookies = cookies as unknown as vi.Mock;

function mockSidCookie(value: string | undefined) {
  mockedCookies.mockReturnValue({
    get: vi.fn().mockReturnValue(
      value === undefined ? undefined : { value },
    ),
  });
}

describe('server/auth ユーティリティ', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  /**
   * SERVER_AUTH-TC-01:
   *  sid クッキーなし → getUser は { user: null } を返す
   */
  it('SERVER_AUTH-TC-01: sid クッキーなしなら user:null', async () => {
    mockSidCookie(undefined);

    const result = await getUser();

    expect(result).toEqual({ user: null });
  });

  /**
   * SERVER_AUTH-TC-02:
   *  sid クッキーあり → getUser は { user: { id: "U1" } } を返す
   *  （現状の実装は id 固定の体裁）
   */
  it('SERVER_AUTH-TC-02: sid クッキーありなら id="U1" を返す', async () => {
    mockSidCookie('dummy-session-id');

    const result = await getUser();

    expect(result).toEqual({ user: { id: 'U1' } });
  });

  /**
   * SERVER_AUTH-TC-03:
   *  sid クッキーあり → requireUserId は "U1" を返す
   */
  it('SERVER_AUTH-TC-03: sid クッキーありなら requireUserId は "U1" を返す', async () => {
    mockSidCookie('dummy-session-id');

    const userId = await requireUserId();

    expect(userId).toBe('U1');
  });

  /**
   * SERVER_AUTH-TC-04:
   *  sid クッキーなし → requireUserId は "UNAUTHORIZED" で例外
   */
  it('SERVER_AUTH-TC-04: sid クッキーなしなら requireUserId は UNAUTHORIZED を投げる', async () => {
    mockSidCookie(undefined);

    await expect(requireUserId()).rejects.toThrow('UNAUTHORIZED');
  });
});
