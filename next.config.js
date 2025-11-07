/** @type {import('next').NextConfig} */
const isProd = process.env.VERCEL_ENV === 'production';
const API_HOST = isProd
  ? 'https://bufetgiph-api.vercel.app'
  : 'https://dev-bufetgiph-api.vercel.app';

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['pdfmake', 'pdfkit', '@foliojs-fork/fontkit'],

  async rewrites() {
    return {
      // 1) Локальные API, которые НЕ надо проксировать наружу
      beforeFiles: [
        // поварский портал
        { source: '/api/kitchen/:path*', destination: '/api/kitchen/:path*' },
        { source: '/api/dishes/:path*', destination: '/api/dishes/:path*' },
        { source: '/api/debug/:path*',  destination: '/api/debug/:path*' },
        { source: '/api/_debug/:path*', destination: '/api/_debug/:path*' },
      ],

      // 2) Всё остальное /api/* — как и раньше в ваш отдельный API-проект
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
