import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');

function modelBody(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  if (start < 0) return '';
  const end = schema.indexOf('\n}', start);
  return end < 0 ? '' : schema.slice(start, end);
}

describe('v0.8 Prisma schema', () => {
  it('DB_SCHEMA-TC-01: Business entities use User-scoped compound identity', () => {
    for (const model of ['Box', 'Item', 'BoxLocation']) {
      expect(modelBody(model)).toContain('@@id([userId, id])');
    }
  });

  it('DB_SCHEMA-TC-02: Box uses locationId/parentBoxId and has no legacy free-text location', () => {
    const body = modelBody('Box');
    expect(body).toContain('locationId');
    expect(body).toContain('parentBoxId');
    expect(body).not.toMatch(/\n\s+location\s+String/);
  });

  it('DB_SCHEMA-TC-03: Business entities contain sync metadata', () => {
    for (const model of ['Box', 'Item', 'BoxLocation']) {
      const body = modelBody(model);
      for (const field of ['deletedAt', 'serverUpdatedAt', 'revision', 'contentHash', 'syncSeq']) {
        expect(body).toContain(field);
      }
    }
  });

  it('DB_SCHEMA-TC-04: server sync/restore infrastructure is present', () => {
    for (const model of [
      'SyncSequence',
      'SyncChangeLog',
      'SyncConflict',
      'RestoreLock',
      'RestoreApplyResult',
      'FullResyncSnapshot',
      'FullResyncSnapshotEntity',
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
  });

  it('DB_SCHEMA-TC-05: Device namespace models are present', () => {
    expect(schema).toContain('model Device {');
    expect(schema).toContain('model DevicePrefix {');
  });

  it('DB_SCHEMA-TC-06: removed v0.8 legacy models/fields are absent', () => {
    expect(schema).not.toContain('model Tag {');
    expect(schema).not.toContain('enum TagKind {');
    expect(schema).not.toContain('aiState');
    expect(schema).not.toContain('aiUpdatedAt');
  });

  it('DB_SCHEMA-TC-07: unassigned Box/Location references are nullable while foreign keys remain', () => {
    const box = modelBody('Box');
    const item = modelBody('Item');

    expect(box).toMatch(/\n\s+locationId\s+String\?/);
    expect(box).toMatch(/\n\s+location\s+BoxLocation\?/);
    expect(item).toMatch(/\n\s+boxId\s+String\?/);
    expect(item).toMatch(/\n\s+box\s+Box\?/);
    expect(schema).not.toMatch(/["']UNASSIGNED["']/);
  });
});
