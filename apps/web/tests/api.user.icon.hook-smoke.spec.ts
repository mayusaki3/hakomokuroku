// apps/web/tests/api.user.icon.hook-smoke.spec.ts
import { it, expect, vi } from 'vitest';
import { PUT, __hooks } from '@/app/api/user/icon/route';
import { requireUserId } from '@/server/auth';

vi.mock('@/server/auth', () => ({ requireUserId: vi.fn() }));

it('parseAndNormalizeDataURL を実際に呼び出している（spy が刺さる）', async () => {
  // 認証は必ず成功
  (requireUserId as any).mockResolvedValue('U1');

  // ① parse は __hooks から spy
  const parseSpy = vi.spyOn(__hooks, 'parseAndNormalizeDataURL');

  // ② DB 更新も __hooks.updateUserIcon をモックして 200 相当の挙動にする
  const updateSpy = vi.spyOn(__hooks, 'updateUserIcon').mockResolvedValue({ id: 'U1' } as any);

  const req = new Request('http://t/api/user/icon', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataURL: 'data:image/png;base64,AAA' }),
  });

  const res = await PUT(req);

  // parse が 1 回呼ばれていること
  expect(parseSpy).toHaveBeenCalledTimes(1);
  // DB をモックしているので 200 を期待してよい
  expect(res.status).toBe(200);

  parseSpy.mockRestore();
  updateSpy.mockRestore();
});
