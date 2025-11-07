/** @type {import('next').NextConfig} */
const isProd = process.env.VERCEL_ENV === 'production';
// В превью направляем фронт на dev API, в проде — на prod API
const API_HOST = isProd
  ? 'https://bufetgiph-api.vercel.app'
  : 'https://dev-bufetgiph-api.vercel.app';

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['pdfmake', 'pdfkit', '@foliojs-fork/fontkit'],

  async rewrites() {
    return {
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
