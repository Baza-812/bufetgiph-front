/** @type {import('next').NextConfig} */
const isPreview =
  process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV !== 'production';

const API_HOST = isPreview
  ? 'https://dev-bufetgiph-api.vercel.app'   // dev API
  : 'https://bufetgiph-api.vercel.app';      // prod API

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['pdfmake', 'pdfkit', '@foliojs-fork/fontkit'],

  async rewrites() {
    return {
      // ВАЖНО: beforeFiles — переписывает ДО матчей файловой системы,
      // значит ЛЮБОЙ /api/* пойдёт на backend, а не на локальные API-роуты фронта
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: `${API_HOST}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
