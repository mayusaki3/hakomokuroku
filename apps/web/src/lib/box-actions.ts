// apps/web/src/lib/box-actions.ts
export async function deleteBoxToUnassigned(boxId: string) {
  const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}/delete`, {
    method: 'POST',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<{
    ok: true;
    movedItems: number;
    deletedLocations: number;
    deletedBoxId: string;
  }>;
}
