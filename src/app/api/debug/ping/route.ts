export async function GET() {
  return new Response(JSON.stringify({ ok: true, where: 'api/debug/ping' }), {
    headers: { 'content-type': 'application/json' },
  });
}
