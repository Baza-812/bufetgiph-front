// next.config.js
/** @type {import('next').NextConfig} */
const isProd = process.env.VERCEL_ENV === 'production';
const API_HOST = isProd
  ? 'https://bufetgiph-api.vercel.app'
  : 'https://dev-bufetgiph-api.vercel.app';

// СЮДА добавляем все локальные ветки фронта, которые НЕ должны уходить наружу.
// Удобно держать списком — меньше шансов забыть.
const LOCAL_API_PREFIXES = [
  '/api/kitchen',
  '/api/dishes',
  '/api/debug',
  '/api/_debug',
  '/api/ping',        // тех.проверка, можно удалить после
  // добавишь новые — просто допиши сюда строку
];

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['pdfmake', 'pdfkit', '@foliojs-fork/fontkit'],

  async rewrites() {
    return {
      // 1) Локальные API: оставляем внутри фронта
      beforeFiles: LOCAL_API_PREFIXES.map((p) => ({
        source: `${p}/:path*`,
        destination: `${p}/:path*`,
      })),

      // 2) Всё остальное /api/* — наружу (внешний API-проект)
      fallback: [
        {
          source: '/api/:path*',
          destination: `${API_HOST}/api/:path*`,
        },
      ],
    };
  },
};

module.exports = nextConfig;
