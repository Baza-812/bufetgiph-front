// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Берём URL бэкенда из переменной окружения.
    // Пример: https://bufetgiph-api.vercel.app  (без завершающего /)
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL
      // на локалке можно подставить свой dev-бэкенд, если переменная не задана
      || (process.env.NODE_ENV === 'development'
          ? 'https://bufetgiph-api.vercel.app'
          : '');

    // Если backend не задан в проде — rewrite не делаем (чтобы не сломать сборку),
    // но лучше ВСЕГДА задать NEXT_PUBLIC_BACKEND_URL в настройках Vercel (frontend-проекта).
    if (!backend) return [];

    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
