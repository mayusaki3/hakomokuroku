import { describe, expect, it } from 'vitest';
import { businessContentHash, canonicalBusinessPayload } from '@/server/business-content-hash';

const item = {
  boxId: 'box-1',
  name: '  テスト  ',
  tags: ['z', 'a', 'a'],
  note: null,
  thumbs: [],
  meta: { b: 2, a: 1 },
  deletedAt: null,
};

describe('business content hash canonicalization', () => {
  it('BUSINESS_HASH-TC-01: ignores metadata and tag order', () => {
    const a = businessContentHash('ITEM', item);
    const b = businessContentHash('ITEM', {
      ...item, tags: ['a', 'z'], meta: { a: 1, b: 2 },
      revision: 123n, syncSeq: 456n, updatedAt: new Date(),
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('BUSINESS_HASH-TC-02: unassigned is null and changes the hash', () => {
    expect(canonicalBusinessPayload('ITEM', { ...item, boxId: null }).boxId).toBeNull();
    expect(businessContentHash('ITEM', item)).not.toBe(
      businessContentHash('ITEM', { ...item, boxId: null }),
    );
  });

  it('BUSINESS_HASH-TC-03: tombstone is a boolean, not a timestamp', () => {
    expect(businessContentHash('ITEM', { ...item, deletedAt: new Date('2026-01-01') })).toBe(
      businessContentHash('ITEM', { ...item, deletedAt: new Date('2026-02-01') }),
    );
    expect(businessContentHash('ITEM', item)).not.toBe(
      businessContentHash('ITEM', { ...item, deletedAt: new Date('2026-01-01') }),
    );
  });

  it('BUSINESS_HASH-TC-04: normalized strings produce the same hash', () => {
    expect(businessContentHash('ITEM', item)).toBe(
      businessContentHash('ITEM', { ...item, name: 'テスト' }),
    );
  });
});
