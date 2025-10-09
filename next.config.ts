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
      // Прокси на backend ПОД ОТДЕЛЬНЫМ ПРЕФИКСОМ, чтобы не пересекаться с локальными /api/* фронта
      beforeFiles: [
        {
          source: '/backend/:path*',
          destination: `${API_HOST}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
