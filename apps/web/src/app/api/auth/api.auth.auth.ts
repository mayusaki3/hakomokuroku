// apps/web/src/app/api/auth/auth.ts
// 目的: 保護API用の“ユーザー必須”チェックをモックしやすくする薄いラッパ。
// ルートからは @/server/auth を直接読まず、必ずこちらを import してください。

export { requireUserId } from '@/server/auth';
