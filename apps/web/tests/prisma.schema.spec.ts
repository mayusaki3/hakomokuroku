import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');

describe('v0.8 Prisma schema', () => {
  it('DB_SCHEMA-TC-01: Business entities use User-scoped compound identity', () => {
    for (const model of ['Box', 'Item', 'BoxLocation']) {
      const body = schema.match(new RegExp(`model ${model} \\\\{([\\\\s\\\\S]*?)\\\\n\\\\}`))?.[1] ?? '';
      expect(body).toContain('@@id([userId, id])');
    }
  });

  it('DB_SCHEMA-TC-02: Box uses locationId/parentBoxId and has no legacy free-text location', () => {
    const body = schema.match(/model Box \\{([\\s\\S]*?)\\n\\}/)?.[1] ?? '';
    expect(body).toContain('locationId');
    expect(body).toContain('parentBoxId');
    expect(body).not.toMatch(/\\n\\s+location\\s+String/);
  });

  it('DB_SCHEMA-TC-03: Business entities contain sync metadata', () => {
    for (const model of ['Box', 'Item', 'BoxLocation']) {
      const body = schema.match(new RegExp(`model ${model} \\\\{([\\\\s\\\\S]*?)\\\\n\\\\}`))?.[1] ?? '';
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
});
