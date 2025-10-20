// apps/web/src/app/api/settings/vision/save/route.ts
import { NextResponse } from 'next/server'; import { requireUserId } from '@/server/auth'; import { prisma } from '@/server/prisma';
export async function POST(req:Request){
  const uid=await requireUserId(req);
  const b=await req.json();
  await prisma.userSetting.upsert({
    where:{ userId:uid }, update:{
      visionProvider:b.provider, visionApiKey:b.apiKey,
      visionPromptName:b.promptName, visionPromptTags:b.promptTags, visionPromptNote:b.promptNote,
    }, create:{
      userId:uid, visionProvider:b.provider, visionApiKey:b.apiKey,
      visionPromptName:b.promptName, visionPromptTags:b.promptTags, visionPromptNote:b.promptNote,
    }
  });
  return NextResponse.json({ok:true});
}
