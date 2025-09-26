// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // во время разработки отправляем все /api/* на ваш рабочий бэкенд
    return process.env.NODE_ENV === 'development'
      ? [
          {
            source: '/api/:path*',
            destination: 'https://bufetgiph-api.vercel.app/api/:path*',
          },
        ]
      : [];
  },
};
export default nextConfig;
