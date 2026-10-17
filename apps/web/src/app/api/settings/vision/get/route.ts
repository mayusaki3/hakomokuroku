import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth';
import { prisma } from '@/server/prisma';

export async function GET(req: Request) {
  const uid = await requireUserId(req);
  const setting = await prisma.userSetting.findUnique({ where: { userId: uid } });
  const values = setting?.uiSettings;
  const ui = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
  const field = (key: string) => {
    const value = (ui as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  };
  return NextResponse.json({
    provider: field('visionProvider') || 'none',
    apiKey: field('visionApiKey'),
    promptName: field('visionPromptName'),
    promptTags: field('visionPromptTags'),
    promptNote: field('visionPromptNote'),
  });
}
