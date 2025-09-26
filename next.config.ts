// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // ВСЕГДА проксируем на продовый API
    return [
      {
        source: '/api/:path*',
        destination: 'https://bufetgiph-api.vercel.app/api/:path*',
      },
    ];
  },
};

export default nextConfig;
