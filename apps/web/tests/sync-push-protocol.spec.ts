import { describe, expect, it } from 'vitest';
import { checkPushReplay, parsePushOperation, pushFingerprint } from '@/server/sync-push-protocol';

const op = {
  operationId: 'ad45c7f0-73f5-45f1-8021-37dff231e3a8',
  entityType: 'BOX', entityId: 'box1', operation: 'UPSERT',
  baseRevision: '1', contentHash: 'sha256', payload: { id: 'box1', name: 'A', tags: ['a'] },
};
describe('v0.8 Push protocol', () => {
  it('accepts a valid operation', () => {
    expect(parsePushOperation(op).entityId).toBe('box1');
  });
  it('rejects invalid revisions, entity IDs and operation IDs', () => {
    for (const bad of [
      { ...op, baseRevision: '-1' },
      { ...op, baseRevision: '9223372036854775808' },
      { ...op, payload: { id: 'another' } },
      { ...op, operationId: 'reused' },
    ]) expect(() => parsePushOperation(bad)).toThrow('INVALID_PUSH_OPERATION');
  });
  it('canonicalizes payload keys for retry fingerprints', () => {
    const a = pushFingerprint(parsePushOperation(op));
    const b = pushFingerprint(parsePushOperation({
      ...op, payload: { tags: ['a'], name: 'A', id: 'box1' },
    }));
    expect(a).toBe(b);
  });
  it('rejects reuse of an operation ID with a different request', () => {
    const a = pushFingerprint(parsePushOperation(op));
    const b = pushFingerprint(parsePushOperation({ ...op, payload: { id: 'box1', name: 'B' } }));
    expect(() => checkPushReplay(a, b)).toThrow('PUSH_OPERATION_ID_REUSED');
    expect(() => checkPushReplay(a, a)).not.toThrow();
  });
});
