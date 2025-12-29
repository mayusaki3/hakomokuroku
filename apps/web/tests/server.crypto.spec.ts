// apps/web/tests/server.crypto.spec.ts
// server/crypto.ts の単体テスト（純ユーティリティ）
//
// 方針:
// - 既知入力に対して確定値を検証（sha256hex）
// - 出力の形式（URL-safe / hex / b64url）を検証（randomUrlSafe / bothHashes）
// - 乱数そのものの品質検証はしない（形式・最低限の性質のみ）

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

import { sha256hex, randomUrlSafe, bothHashes } from '@/server/crypto';

describe('SERVER_CRYPTO (server/crypto.ts)', () => {
  it('SERVER_CRYPTO-TC-01: sha256hex は既知入力に対して期待通りのhexを返す', () => {
    // SHA-256("abc") の既知値
    expect(sha256hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );

    // 空文字も検証（sha256("") の既知値）
    expect(sha256hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('SERVER_CRYPTO-TC-02: sha256hex は常に小文字hex(64桁)を返す', () => {
    const out = sha256hex('Hello');
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });

  it('SERVER_CRYPTO-TC-03: randomUrlSafe はURL-safeな文字のみを返し、"+" "/" "=" を含まない', () => {
    const out = randomUrlSafe(32);

    // base64url風の文字（A-Z a-z 0-9 - _）のみ
    expect(out).toMatch(/^[A-Za-z0-9\-_]+$/);

    // 不要文字が含まれない
    expect(out.includes('+')).toBe(false);
    expect(out.includes('/')).toBe(false);
    expect(out.includes('=')).toBe(false);
  });

  it('SERVER_CRYPTO-TC-04: randomUrlSafe は len=0 でも例外なく文字列を返す（空文字可）', () => {
    const out = randomUrlSafe(0);
    expect(typeof out).toBe('string');
    // Nodeの実装上 empty になり得るため、ここでは空許容
    expect(out).toMatch(/^[A-Za-z0-9\-_]*$/);
  });

  it('SERVER_CRYPTO-TC-05: bothHashes は sha256hex と整合し、b64url も期待通り変換される', () => {
    const input = 'test-token';
    const got = bothHashes(input);

    // hex は sha256hex と一致する
    expect(got.hex).toBe(sha256hex(input));
    expect(got.hex).toMatch(/^[0-9a-f]{64}$/);

    // b64url は digest(base64) を URL-safe に変換し、末尾 "=" を除去したものと一致する
    const buf = crypto.createHash('sha256').update(input, 'utf8').digest();
    const expectedB64Url = buf
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    expect(got.b64url).toBe(expectedB64Url);
    expect(got.b64url).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});
