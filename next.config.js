/** @type {import('next').NextConfig} */
const nextConfig = {
  // чтобы линт не валил прод-сборку
  eslint: { ignoreDuringBuilds: true },

  // важное: не бандлить pdf-пакеты, а тянуть их из node_modules на рантайме
  serverExternalPackages: ['pdfmake', 'pdfkit', '@foliojs-fork/fontkit'],

  async rewrites() {
    // локальные /api маршруты (например, /api/report/generate) обрабатываются самим приложением,
    // всё остальное под /api/* уходит фолбэком на внешний продовый API
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
