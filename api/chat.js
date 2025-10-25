// api/chat.js  Node.js Runtime - OpenAI版
export const runtime = 'nodejs';

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // 从环境变量获取API密钥
});

// 模拟Redis缓存（如果没有Redis）
let cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

function getCache(key) {
  const item = cache.get(key);
  if (item && Date.now() - item.ts < CACHE_TTL) {
    return item.value;
  }
  return null;
}

function setCache(key, value) {
  cache.set(key, { value, ts: Date.now() });
  // 清理过期项目
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [key, item] of cache.entries()) {
      if (now - item.ts > CACHE_TTL) {
        cache.delete(key);
      }
    }
  }
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
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return new Response('Missing OPENAI_API_KEY', { status: 500 });
  }

  try {
    const body = await req.json();
    const { content, title } = body;
    if (!content || !title) {
      return new Response('content or title empty', { status: 400 });
    }

    // 检查缓存
    const key = `cache:${Buffer.from(content + title).toString('base64').slice(0, 32)}`;
    const cached = getCache(key);
    if (cached) {
      return new Response(JSON.stringify(cached), { 
        headers: { 
          'content-type': 'application/json', 
          'X-Cache': 'HIT' 
        } 
      });
    }

    const prompt = buildPrompt(content, title);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // 你可以根据需要更改为 gpt-4
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 600,
    });

    const result = {
      choices: [{
        message: {
          content: completion.choices[0].message.content
        }
      }]
    };

    // 保存到缓存
    setCache(key, result);

    return new Response(JSON.stringify(result), { 
      headers: { 
        'content-type': 'application/json', 
        'X-Cache': 'MISS' 
      } 
    });
  } catch (e) {
    console.error('API Error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}



