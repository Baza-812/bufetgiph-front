/** @type {import('next').NextConfig} */
const isPreview =
  process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV !== 'production';

const API_HOST = isPreview
  ? 'https://dev-bufetgiph-api.vercel.app'   // ← DEV API
  : 'https://bufetgiph-api.vercel.app';      // ← PROD API

const nextConfig = {
  // чтобы линт не валил прод-сборку
  eslint: { ignoreDuringBuilds: true },

  // важное: не бандлить pdf-пакеты, а тянуть их из node_modules на рантайме
  serverExternalPackages: ['pdfmake', 'pdfkit', '@foliojs-fork/fontkit'],

  async rewrites() {
    return {
      // 1) Жёстко отправляем /api/dates на бэкенд (до файловой системы),
      //    чтобы ни один локальный роут его не перехватил.
      beforeFiles: [
        { source: '/api/dates', destination: `${API_HOST}/api/dates` },
        { source: '/api/dates/:path*', destination: `${API_HOST}/api/dates/:path*` },
      ],
      // 2) Остальные /api/*: сначала локальные роуты фронта,
      //    если не совпало — уходим на внешний API (как у тебя было).
      fallback: [
        { source: '/api/:path*', destination: `${API_HOST}/api/:path*` },
      ],
    };
  },
};

export default nextConfig;
