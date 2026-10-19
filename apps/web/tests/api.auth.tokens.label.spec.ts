import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/auth/tokens/label/route';

describe('Legacy sync-token label endpoint', () => {
  it('returns 501 until token ownership semantics are implemented', async () => {
    const res = await POST();
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: 'not_implemented' });
  });
});
