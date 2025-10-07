import { z } from 'zod';

export const boxZ = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().default(''),
  location: z.string().nullable().optional(),
  tags: z.any().optional(), // SQLiteではJson。配列想定だが安全に any で受ける
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const itemZ = z.object({
  id: z.string().min(1),
  boxId: z.string().min(1),
  name: z.string().default(''),
  tags: z.any().optional(),
  note: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const syncPushZ = z.object({
  boxes: z.array(boxZ),
  items: z.array(itemZ),
});
export type SyncPush = z.infer<typeof syncPushZ>;
