export function buildSignedBoxUrl(code: string, baseUrl: string, secret: string) {
  // 署名は本来サーバーで発行するのが鉄則。ここは“自己ホスト・単利用”前提の最小例としてクライアント生成も許容。
  const t = Math.floor(Date.now() / 1000); // 秒
  const data = `${code}|${t}`;
  const sig = hmacSha256Base64Url(secret, data);
  return `${baseUrl.replace(/\/+$/, '')}/b/${encodeURIComponent(code)}?t=${t}&sig=${sig}`;
}

// WebCrypto 版 HMAC（Base64URL）
function base64url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
export async function hmacSha256Base64Url(secret: string, msg: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return base64url(sig);
}
