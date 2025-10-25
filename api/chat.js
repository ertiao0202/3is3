// api/chat.js  Node.js Runtime
export const runtime = 'nodejs';

const MODEL = 'moonshot-v1-8k@quant';
const apiKey = process.env.KIMI_API_KEY;

let _redis; // 懒加载实例
function redis() {
  if (_redis) return _redis;
  const { Redis } = require('@upstash/redis');
  _redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    retry: { retries: 0 },
  });
  return _redis;
}

const buildPrompt = (content, title) =>
`FactLens-EN-v2
Title:${title}
Credibility:X/10
Facts:1.conf:0.XX<fact>sentence</fact>
Opinions:1.conf:0.XX<opinion>sentence</opinion>
Bias:-E:N conf:0.XX -B:N -M:N -F:N -Stance:neutral/leaning X%
Pub:xxx(≤15w) PR:xxx(≤8w) Sum:xxx(≤8w)
Text:${content}`.trim();

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!apiKey) return new Response('Missing KIMI_API_KEY', { status: 500 });

  try {
    const body = await req.json();
    const { content, title } = body;
    if (!content || !title) return new Response('content or title empty', { status: 400 });

    const key = `cache:${Buffer.from(content + title).toString('base64').slice(0, 32)}`;
    const cached = await redis().get(key); // 懒加载
    if (cached) return new Response(cached, { headers: { 'content-type': 'application/json', 'X-Cache': 'HIT' } });

    const prompt = buildPrompt(content, title);
    const payload = { model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 600 };

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5_000);
    const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      signal: controller.signal,
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(await res.text());
    const answer = await res.json();
    const str = JSON.stringify(answer);
    await redis().set(key, str, { ex: 86400 });
    return new Response(str, { headers: { 'content-type': 'application/json', 'X-Cache': 'MISS' } });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}
