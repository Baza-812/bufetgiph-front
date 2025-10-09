// next.config.js
const isPreview =
  process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV !== 'production';

const API_HOST = isPreview
  ? 'https://dev-bufetgiph-api.vercel.app'   // dev API
  : 'https://bufetgiph-api.vercel.app';      // prod API

module.exports = {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['pdfmake', 'pdfkit', '@foliojs-fork/fontkit'],

  async rewrites() {
    return {
      // префикс без конфликтов с локальными /api/*
      beforeFiles: [
        { source: '/backend/:path*', destination: `${API_HOST}/api/:path*` },
      ],
    };
  },
};
