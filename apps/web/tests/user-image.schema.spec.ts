import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Validate the isolated pre-implementation fixture; do not treat this as a
// production-schema or API test.
const fixture = readFileSync(
  resolve(process.cwd(), '../../tests/schema-validation/user-image-relations.prisma'),
  'utf8',
);

function body(name: string): string {
  const start = fixture.indexOf(`model ${name} {`);
  if (start < 0) throw new Error(`Missing model: ${name}`);
  const end = fixture.indexOf('\n}', start);
  if (end < 0) throw new Error(`Unclosed model: ${name}`);
  return fixture.slice(start, end);
}

describe('UserImage isolated Prisma fixture contract', () => {
  it('UI-FK-001: image identity is scoped by User', () => {
    expect(body('UserImage')).toContain('@@id([userId, id])');
    expect(body('UserImage')).toMatch(/user\s+User\s+@relation\("UserImages", fields: \[userId\], references: \[id\], onDelete: Cascade\)/);
  });

  it('UI-FK-002: icon FK includes owner identity', () => {
    expect(body('User')).toContain('fields: [id, iconImageId], references: [userId, id]');
    expect(body('User')).toContain('onDelete: NoAction');
  });

  it('UI-FK-003: wallpaper FK includes owner identity', () => {
    expect(body('Theme')).toContain('fields: [userId, wallpaperImageId], references: [userId, id]');
    expect(body('Theme')).toContain('onDelete: NoAction');
  });

  it('UI-FK-004: settings JSON is required without SQLite-invalid default', () => {
    expect(body('UserSetting')).toMatch(/uiSettings\s+Json\s*\n/);
    expect(body('UserSetting')).not.toMatch(/uiSettings\s+Json\s+@default/);
  });

  it('UI-FK-005: image kind and lifecycle status are modeled', () => {
    expect(fixture).toContain('ACCOUNT_ICON');
    expect(fixture).toContain('THEME_WALLPAPER');
    expect(fixture).toContain('STAGING');
    expect(fixture).toContain('READY');
  });
});
