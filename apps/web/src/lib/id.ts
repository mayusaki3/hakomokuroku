// apps/web/src/lib/id.ts
// 読み間違いにくい Base32 文字集合（O/I/L/0/1 を除外）
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateBoxCode(length = 5) {
  let s = '';
  crypto.getRandomValues(new Uint32Array(length)).forEach(v => {
    s += ALPHABET[v % ALPHABET.length];
  });
  return `BX-${s}`;
}
