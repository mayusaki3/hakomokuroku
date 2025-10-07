// apps/web/src/app/api/sync/types.ts
import { z } from 'zod';

export const boxZ = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().default(''),
  location: z.string().nullable().optional(),
  tags: z.any().optional(),                 // ["引越し", ...] を想定（Json互換）
  thumbs: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const itemZ = z.object({
  id: z.string().min(1),
  boxId: z.string().min(1),
  name: z.string().default(''),
  tags: z.any().optional(),
  note: z.string().nullable().optional(),
  thumbs: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** 置き場所（1:1想定） */
export const boxLocationZ = z.object({
  id: z.string().min(1),
  boxId: z.string().min(1),
  thumbs: z.array(z.string()).optional(),
  note: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const syncPushZ = z.object({
  boxes: z.array(boxZ),
  items: z.array(itemZ),
  locations: z.array(boxLocationZ).default([]),
});
export type SyncPush = z.infer<typeof syncPushZ>;
