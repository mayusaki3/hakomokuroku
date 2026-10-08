import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');

function modelBody(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  if (start < 0) throw new Error(`Missing model: ${name}`);
  const end = schema.indexOf('\n}', start);
  if (end < 0) throw new Error(`Unclosed model: ${name}`);
  return schema.slice(start, end);
}

describe('AuthSession production Prisma schema', () => {
  it('AUTH-PDB-001: User has sessions relation', () => {
    expect(modelBody('User')).toMatch(/authSessions\s+AuthSession\[\]/);
  });

  it('AUTH-PDB-002: token hash unique and plaintext absent', () => {
    const session = modelBody('AuthSession');
    expect(session).toMatch(/tokenHash\s+String\s+@unique/);
    expect(session).not.toMatch(/\n\s+token\s+String/);
  });

  it('AUTH-PDB-003: session FK cascades with User deletion', () => {
    expect(modelBody('AuthSession')).toContain(
      'fields: [userId], references: [id], onDelete: Cascade',
    );
  });

  it('AUTH-PDB-004: expiry, revocation and indexes exist', () => {
    const session = modelBody('AuthSession');
    expect(session).toMatch(/expiresAt\s+DateTime\b/);
    expect(session).toMatch(/revokedAt\s+DateTime\?/);
    expect(session).toContain('@@index([userId, expiresAt])');
    expect(session).toContain('@@index([expiresAt])');
  });
});
