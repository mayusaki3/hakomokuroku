// apps/web/tests/api.user.icon.hook-smoke.spec.ts
import { it, expect, vi } from 'vitest';
import * as mod from '@/app/api/user/icon/route';
import { PUT } from '@/app/api/user/icon/route';
import { requireUserId } from '@/server/auth';

vi.mock('@/server/auth', () => ({ requireUserId: vi.fn() }));
vi.mock('@/server/prisma', () => ({
  prisma: { user: { update: vi.fn().mockResolvedValue({ id: 'U1' }) } },
}));

it('parseAndNormalizeDataURL を実際に呼び出している（spy が刺さる）', async () => {
  (requireUserId as any).mockResolvedValue('U1');

  const spy = vi.spyOn(mod as any, 'parseAndNormalizeDataURL');
  const req = new Request('http://t/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: 'data:image/png;base64,AAA' }),
  });

  const res = await PUT(req);
  expect(spy).toHaveBeenCalledTimes(1);
  expect([200, 400]).toContain(res.status); // どちらでも spy が刺さっていれば OK
  spy.mockRestore();
});
