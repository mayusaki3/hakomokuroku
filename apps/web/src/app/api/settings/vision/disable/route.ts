// apps/web/src/app/api/settings/vision/disable/route.ts
import { NextResponse } from 'next/server'; import { requireUserId } from '@/server/auth'; import { prisma } from '@/server/prisma';
export async function POST(req:Request){
  const uid=await requireUserId(req);
  await prisma.userSetting.upsert({
    where:{ userId:uid }, update:{ visionProvider:'none' }, create:{ userId:uid, visionProvider:'none' }
  });
  return NextResponse.json({ok:true});
}
