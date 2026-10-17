import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth';
import { prisma } from '@/server/prisma';

export async function POST(req: Request) {
  const uid = await requireUserId(req);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const fields: Record<string, string> = {
    provider: 'visionProvider',
    apiKey: 'visionApiKey',
    promptName: 'visionPromptName',
    promptTags: 'visionPromptTags',
    promptNote: 'visionPromptNote',
  };
  const patch: Record<string, string> = {};
  for (const [input, key] of Object.entries(fields)) {
    if (body[input] !== undefined) {
      if (typeof body[input] !== 'string') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
      patch[key] = body[input] as string;
    }
  }
  await prisma.$transaction(async (tx) => {
    const current = await tx.userSetting.findUnique({ where: { userId: uid } });
    const value = current?.uiSettings;
    const previous = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const uiSettings = { ...previous, ...patch };
    await tx.userSetting.upsert({
      where: { userId: uid },
      update: { uiSettings },
      create: { userId: uid, uiSettings },
    });
  });
  return NextResponse.json({ ok: true });
}
