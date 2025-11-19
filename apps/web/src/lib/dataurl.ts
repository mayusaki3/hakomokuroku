// apps/web/src/lib/dataurl.ts

/**
 * data: URL を解析し、検証済みの { mime, buffer } を返す。
 * - 許可 mime: image/png のみ
 * - base64 部に改行/空白が混ざっていても正規化して許容
 * - base64 が空/不正は Error を投げる（呼び出し側で 400 を返せる）
 */
export function parseAndNormalizeDataURL(input: unknown): { mime: string; buffer: Buffer } {
  if (typeof input !== 'string') {
    throw new Error('Invalid dataURL: not a string');
  }

  // 先頭 "data:" を強制
  if (!input.startsWith('data:')) {
    throw new Error('Invalid dataURL: no data: scheme');
  }

  // 形式: data:<mime>;base64,<payload>
  const match = /^data:([^;,]+);base64,(.*)$/i.exec(input);
  if (!match) {
    throw new Error('Invalid dataURL: not base64 form');
  }

  const mime = match[1].toLowerCase();
  let b64 = match[2] ?? '';

  // 許可する mime は PNG のみ（テスト要件）
  if (mime !== 'image/png') {
    throw new Error('Invalid mime type');
  }

  // 改行・空白は除去して正規化
  b64 = b64.replace(/\s+/g, '');

  if (b64.length === 0) {
    throw new Error('Empty base64');
  }

  // base64 検証（不正は Error）
  let buffer: Buffer;
  try {
    buffer = Buffer.from(b64, 'base64');
  } catch {
    throw new Error('Invalid base64');
  }
  // デコード結果が空（=不正）のケースも弾く
  if (!buffer || buffer.length === 0) {
    throw new Error('Invalid base64 (empty buffer)');
  }

  return { mime, buffer };
}
