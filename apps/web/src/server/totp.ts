import { authenticator } from 'otplib';

// 許容ウィンドウを±1に（最大±30秒ぶん）
authenticator.options = { window: 1 };

export function totpCheck(code: string, secret: string) {
  return authenticator.check(code, secret);
}
export function genSecret() {
  return authenticator.generateSecret();
}
export function keyuri(userId: string, issuer: string, secret: string) {
  return authenticator.keyuri(userId, issuer, secret);
}
