import { prisma } from "@/server/prisma";
import { requireUserId } from "@/server/auth";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sinceStr = url.searchParams.get("since");
    const since = sinceStr ? new Date(sinceStr) : null;
    const cursor = new Date().toISOString();
    const userId = await requireUserId(req);

    const whereBase = { userId, ...(since ? { updatedAt: { gt: since } } : {}) };

    const [boxes, items, locations] = await Promise.all([
      prisma.box.findMany({ where: whereBase, orderBy: { updatedAt: "asc" } }),
      prisma.item.findMany({ where: whereBase, orderBy: { updatedAt: "asc" } }),
      prisma.boxLocation.findMany({ where: whereBase, orderBy: { updatedAt: "asc" } }),
    ]);

    // JSON→配列 化（null安全）
    const asArr = (v: unknown) => (Array.isArray(v) ? v : []);
    const b2 = boxes.map(b => ({ ...b, tags: asArr(b.tags), thumbs: asArr(b.thumbs) }));
    const i2 = items.map(i => ({ ...i, tags: asArr(i.tags), thumbs: asArr(i.thumbs) }));
    const l2 = locations.map(l => ({ ...l, thumbs: asArr(l.thumbs) }));

    return Response.json({ boxes: b2, items: i2, locations: l2, cursor });
  } catch (e) {
    if (e instanceof Response) return e;
    return new Response("Server Error", { status: 500 });
  }
}
