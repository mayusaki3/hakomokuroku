// apps/web/src/app/api/settings/vision/test/route.ts
import { NextResponse } from 'next/server'; import { requireUserId } from '@/server/auth'; import sharp from 'sharp';
export const runtime='nodejs';
export async function POST(req:Request){
  await requireUserId(req);
  const form=await req.formData(); const file=form.get('file') as File|null;
  if(!file) return NextResponse.json({error:'no_file'},{status:400});
  const buf=Buffer.from(await file.arrayBuffer());
  const out=await sharp(buf).resize(512,512,{fit:'inside'}).jpeg({quality:82}).toBuffer();
  const thumb=`data:image/jpeg;base64,${out.toString('base64')}`;
  // ★ 実際の推論は未実装（ここではダミーを返す）
  return NextResponse.json({ thumbDataUrl:thumb, name:'推定:名称', tags:'推定:タグ1,タグ2', note:'推定:メモ' });
}
