/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },

  // важно: не бандлить нативные пакеты PDF
  serverExternalPackages: ['pdfmake', 'pdfkit', '@foliojs-fork/fontkit'],

  async rewrites() {
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
