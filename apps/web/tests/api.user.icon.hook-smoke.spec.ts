import { it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/server/auth', () => ({ requireUserId: vi.fn() }));
vi.mock('@/server/prisma', () => ({ prisma: { user: { update: vi.fn() } } }));

import { PUT } from '@/app/api/user/icon/route';
import { requireUserId } from '@/server/auth';
import { prisma } from '@/server/prisma';

it('valid PNG dataURL reaches the database update and returns 200', async () => {
  vi.mocked(requireUserId).mockResolvedValue('U1');
  vi.mocked(prisma.user.update).mockResolvedValue({ id: 'U1', iconDataUrl: 'data:image/png;base64,QUFB' } as any);
  const req = new NextRequest('http://t/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: 'data:image/png;base64,QUFB' }),
  });
  const res = await PUT(req);
  expect(res.status).toBe(200);
  expect(prisma.user.update).toHaveBeenCalledWith({
    where: { id: 'U1' },
    data: { iconDataUrl: 'data:image/png;base64,QUFB' },
    select: { id: true, iconDataUrl: true },
  });
});
