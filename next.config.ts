/** @type {import('next').NextConfig} */
const nextConfig = {
  // не валим билд из-за линта (опционально)
  eslint: { ignoreDuringBuilds: true },

  // важно для puppeteer + chromium на Vercel: не бандлить, грузить из node_modules на рантайме
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],

  async rewrites() {
    // локальные маршруты (/api/report/generate) обрабатываются проектом,
    // всё остальное — уходит как fallback на внешний API
    return {
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
