// apps/web/next.config.mjs
// Cloudflareトンネル配下でも動く基本設定のみ。
// fetch の cookies はクライアント側で credentials: 'include' を必ず指定すること。

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { allowedOrigins: ['*'] },
  },
  // 必要なら images.domains など追加
};

export default nextConfig;
