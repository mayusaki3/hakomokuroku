// apps/web/src/app/api/settings/vision/get/route.ts
import { NextResponse } from 'next/server'; import { requireUserId } from '@/server/auth'; import { prisma } from '@/server/prisma';
export async function GET(req:Request){
  const uid=await requireUserId(req);
  const s=await prisma.userSetting.findFirst({ where:{ userId:uid } }).catch(()=>null);
  return NextResponse.json({
    provider: s?.visionProvider ?? 'none',
    apiKey: s?.visionApiKey ?? '',
    promptName: s?.visionPromptName ?? '',
    promptTags: s?.visionPromptTags ?? '',
    promptNote: s?.visionPromptNote ?? '',
  });
}
