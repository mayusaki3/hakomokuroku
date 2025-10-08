import { db, type RegisterDraft } from '@/lib/db';

const LS_ACTIVE_DRAFT = 'hk.register.activeDraftId';

export async function ensureActiveDraft(): Promise<RegisterDraft> {
  const nowIso = new Date().toISOString();
  let id = localStorage.getItem(LS_ACTIVE_DRAFT);
  if (id) {
    const d = await db.table<RegisterDraft, string>('drafts').get(id);
    if (d) return d;
  }
  // 新規作成
  const draft: RegisterDraft = {
    id: crypto.randomUUID(),
    step: 'box',
    box: { tags: [], thumbs: [] },
    items: [],
    location: { thumbs: [], note: null },
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await db.table<RegisterDraft, string>('drafts').add(draft);
  localStorage.setItem(LS_ACTIVE_DRAFT, draft.id);
  return draft;
}

export async function loadActiveDraft(): Promise<RegisterDraft | undefined> {
  const id = localStorage.getItem(LS_ACTIVE_DRAFT);
  if (!id) return undefined;
  return db.table<RegisterDraft, string>('drafts').get(id);
}

export async function saveDraft(patch: Partial<RegisterDraft>) {
  const id = localStorage.getItem(LS_ACTIVE_DRAFT);
  if (!id) throw new Error('No active draft');
  await db.table<RegisterDraft, string>('drafts').update(id, {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearActiveDraft() {
  const id = localStorage.getItem(LS_ACTIVE_DRAFT);
  if (id) {
    await db.table<RegisterDraft, string>('drafts').delete(id);
    localStorage.removeItem(LS_ACTIVE_DRAFT);
  }
}

export function setDraftStep(step: RegisterDraft['step']) {
  return saveDraft({ step });
}
