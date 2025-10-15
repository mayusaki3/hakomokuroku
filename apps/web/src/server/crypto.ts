import { webcrypto } from "crypto";
const enc = new TextEncoder(); const dec = new TextDecoder();

async function getKey() {
  const b64 = process.env.TOTP_ENC_KEY!;
  const raw = Buffer.from(b64, "base64");
  return await webcrypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt","decrypt"]);
}

export async function encryptStr(plain: string) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await getKey();
  const ct = await webcrypto.subtle.encrypt({ name:"AES-GCM", iv }, key, enc.encode(plain));
  return Buffer.concat([Buffer.from(iv), Buffer.from(new Uint8Array(ct))]).toString("base64");
}

export async function decryptStr(b64: string) {
  const buf = Buffer.from(b64, "base64"); const iv = buf.subarray(0,12); const data = buf.subarray(12);
  const key = await getKey();
  const pt = await webcrypto.subtle.decrypt({ name:"AES-GCM", iv:new Uint8Array(iv) }, key, data);
  return dec.decode(pt);
}
