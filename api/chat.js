// api/chat.js  Node.js Runtime
export const runtime = 'nodejs';

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const key  = process.env.KIMI_API_KEY;

  if (!url || !token) return new Response(`Redis env empty: URL=${url}, TOKEN=${token}`, { status: 500 });
  if (!key)  return new Response('KIMI_API_KEY empty', { status: 500 });

  return new Response('Env OK', { status: 200 });
}
