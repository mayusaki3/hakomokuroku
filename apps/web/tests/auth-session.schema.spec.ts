import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(
  resolve(process.cwd(), '../../tests/schema-validation/auth-session.prisma'),
  'utf8',
);

function body(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  if (start < 0) throw new Error(`Missing model ${name}`);
  const end = schema.indexOf('\n}', start);
  if (end < 0) throw new Error(`Unclosed model ${name}`);
  return schema.slice(start, end);
}

describe('AuthSession isolated Prisma fixture contract', () => {
  it('AUTH-DB-001: token hash is unique; no plaintext token field', () => {
    const session = body('AuthSession');
    expect(session).toMatch(/tokenHash\s+String\s+@unique/);
    expect(session).not.toMatch(/\n\s+token\s+String/);
  });

  it('AUTH-DB-002: expiry and revocation are represented', () => {
    const session = body('AuthSession');
    expect(session).toMatch(/expiresAt\s+DateTime\b/);
    expect(session).toMatch(/revokedAt\s+DateTime\?/);
  });

  it('AUTH-DB-003: session owner is a User FK with cascade delete', () => {
    expect(body('AuthSession')).toContain(
      'fields: [userId], references: [id], onDelete: Cascade',
    );
    expect(body('User')).toContain('authSessions AuthSession[]');
  });

  it('AUTH-DB-004: session indexes support owner and expiry lookup', () => {
    const session = body('AuthSession');
    expect(session).toContain('@@index([userId, expiresAt])');
    expect(session).toContain('@@index([expiresAt])');
  });

  it('AUTH-DB-005: User has an active state for authorization', () => {
    expect(body('User')).toMatch(/isActive\s+Boolean\s+@default\(true\)/);
  });
});
