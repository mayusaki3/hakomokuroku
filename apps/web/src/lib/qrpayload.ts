// apps/web/src/lib/qrpayload.ts

/** これから印刷するQRに入れる文字列（MVPはアプリ相対URL） */
export function buildQrPayload(code: string) {
  // 例: /b/BX-ABCDE （PWA/オフラインでも同一アプリ内で自己解決できる）
  return `/b/${encodeURIComponent(code)}`;
}

/** スキャン結果テキストから箱コードを抽出する（URL/独自スキーム/生コード対応） */
export function extractBoxCodeFromText(text: string): string | null {
  if (!text) return null;
  const s = text.trim();

  // 1) 独自スキーム hk:CODE / hakomokuroku:CODE
  let m = s.match(/^(?:hk|hakomokuroku):([A-Z0-9-]{3,})$/i);
  if (m) return m[1].toUpperCase();

  // 2) URLに /b/ または /box/ パスを含む場合
  m = s.match(/\/(?:b|box)\/([A-Za-z0-9-]{3,})(?:[\/?#]|$)/);
  if (m) return m[1].toUpperCase();

  // 3) 生コードらしき文字列（BX- など）
  m = s.match(/^[A-Za-z]{2,3}-[A-Za-z0-9]{3,}$/);
  if (m) return m[0].toUpperCase();

  return null;
}
