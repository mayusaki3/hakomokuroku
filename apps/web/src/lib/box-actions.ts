// Server-side v0.8 Box deletion requires the caller's current revision.
// Do not silently fall back to the legacy destructive local delete path.
export async function deleteBoxToUnassigned(boxId: string, baseRevision: bigint | string) {
  const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRevision: String(baseRevision) }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<{
    ok: true;
    movedItems: number;
    movedBoxes: number;
    deletedBoxId: string;
  }>;
}
