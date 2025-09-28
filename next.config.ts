/** @type {import('next').NextConfig} */
const nextConfig = {
  // чтобы линт не ронял прод-сборку (по желанию)
  eslint: { ignoreDuringBuilds: true },

  // важно для puppeteer + chromium на Vercel
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],

  async rewrites() {
    return {
      // 1) Сначала Next попытается отдать локальные маршруты (/api/report/** и т.п.)
      // 2) Всё, что не найдено локально, пойдёт как "fallback" на внешний API
      fallback: [
        {
          source: '/api/:path*',
          destination: 'https://bufetgiph-api.vercel.app/api/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
