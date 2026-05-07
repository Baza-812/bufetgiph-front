/**
 * Базовый URL внешнего API (bufetgiph-api).
 * На Vercel без BACKEND_URL — те же хосты, что в next.config.js rewrites.
 */
export function getBackendApiBase(): string {
  const explicit = process.env.BACKEND_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return process.env.VERCEL_ENV === 'production'
    ? 'https://bufetgiph-api.vercel.app'
    : 'https://dev-bufetgiph-api.vercel.app';
}
