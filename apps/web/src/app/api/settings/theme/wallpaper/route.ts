import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth';
import sharp from 'sharp';

export const runtime = 'nodejs'; // sharpを使うためedge不可

export async function POST(req: Request) {
  await requireUserId(req); // 認証のみ確認（保存は /save で行う）

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'no_file' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());

  // サムネ生成（最大512px, JPEGに統一）
  const out = await sharp(buf).resize(512, 512, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
  const b64 = out.toString('base64');
  const dataUrl = `data:image/jpeg;base64,${b64}`;

  return NextResponse.json({ thumbDataUrl: dataUrl });
}
