/** @type {import('next').NextConfig} */
const isPreview = process.env.VERCEL_ENV === 'preview'; // dev-стенд на Vercel
const API_HOST = isPreview
  ? 'https://dev-bufetgiph-api.vercel.app'   // ← dev API
  : 'https://bufetgiph-api.vercel.app';      // ← prod API

const nextConfig = {
  // чтобы линт не валил прод-сборку
  eslint: { ignoreDuringBuilds: true },

  // важное: не бандлить pdf-пакеты, а тянуть их из node_modules на рантайме
  serverExternalPackages: ['pdfmake', 'pdfkit', '@foliojs-fork/fontkit'],

  async rewrites() {
    // 1) все локальные /api роуты, которые реально существуют в Next, обрабатываются локально
    // 2) всё остальное под /api/* уходит прокси на нужный API-хост (dev или prod)
    return {
      // если хочешь гарантированно проксировать ВСЁ, можно использовать beforeFiles вместо fallback
      fallback: [
        {
          source: '/api/:path*',
          destination: `${API_HOST}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
