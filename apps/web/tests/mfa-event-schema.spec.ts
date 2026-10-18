/**
 * MFA event schema regression test.
 * Run: pnpm --dir apps/web exec vitest run tests/mfa-event-schema.spec.ts
 * Validates the ordering domain and redemption uniqueness at schema level.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
function model(name: string) {
  const match = schema.match(new RegExp('model ' + name + ' \\{([\\s\\S]*?)\\n\\}'));
  expect(match, name + ' model missing').not.toBeNull();
  return match![1];
}

describe('MFA durable event schema', () => {
  it('assigns one database-generated ordering sequence to all MFA event kinds', () => {
    const events = model('MfaAuthEvent');
    expect(events).toMatch(/id\s+Int\s+@id\s+@default\(autoincrement\(\)\)/);
    expect(events).toMatch(/kind\s+String/);
    expect(events).toMatch(/admissionId\s+Int\?/);
    expect(events).toMatch(/@@index\(\[userId, id\]\)/);
  });

  it('records hashed recovery-code identity without a plaintext code field', () => {
    const events = model('MfaAuthEvent');
    const redemptions = model('MfaRecoveryRedemption');
    expect(events).toMatch(/codeHash\s+String\?/);
    expect(redemptions).toMatch(/codeHash\s+String/);
    expect(redemptions).not.toMatch(/^\s+(recoveryCode|plainCode)\s+/m);
  });

  it('prevents duplicate redemption for the same user and hash', () => {
    const redemptions = model('MfaRecoveryRedemption');
    expect(redemptions).toMatch(/@@unique\(\[userId, codeHash\]\)/);
    expect(redemptions).toMatch(/eventId\s+Int\s+@unique/);
    expect(redemptions).toMatch(/admissionId\s+Int/);
  });

  it('keeps events and redemptions linked to their user for cleanup', () => {
    for (const name of ['MfaAuthEvent', 'MfaRecoveryRedemption']) {
      expect(model(name)).toMatch(/onDelete:\s*Cascade/);
    }
  });
});
