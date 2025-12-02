// apps/web/src/app/api/boxes/[id]/delete/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/server/prisma';

const UNASSIGNED_ID = 'UNASSIGNED';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const boxId = params.id;

  if (!boxId) {
    return NextResponse.json({ error: 'boxId is required' }, { status: 400 });
  }
  if (boxId === UNASSIGNED_ID) {
    return NextResponse.json({ error: 'UNASSIGNED cannot be deleted' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const move = await tx.item.updateMany({
        where: { boxId },
        data: { boxId: UNASSIGNED_ID, updatedAt: new Date() },
      });

      const delLoc = await tx.boxLocation.deleteMany({
        where: { boxId },
      });

      const delBox = await tx.box.delete({
        where: { id: boxId },
      });

      return {
        movedItems: move.count,
        deletedLocations: delLoc.count,
        deletedBoxId: delBox.id,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
