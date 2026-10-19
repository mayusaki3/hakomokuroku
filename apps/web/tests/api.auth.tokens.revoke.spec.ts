import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/auth/tokens/revoke/route';

describe('Legacy sync-token revoke endpoint', () => {
  it('returns 501 rather than falsely claiming a session was revoked', async () => {
    const res = await POST();
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: 'not_implemented' });
  });
});
