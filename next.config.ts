/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
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

