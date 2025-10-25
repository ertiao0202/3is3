// api/chat.js  Node.js Runtime - OpenAI快速测试版
export const runtime = 'nodejs';

// 简单的OpenAI API调用（不使用Redis缓存以简化）
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // 检查API密钥
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response('Missing OPENAI_API_KEY environment variable', { status: 500 });
  }

  try {
    const body = await req.json();
    const { content, title } = body;
    
    if (!content || !title) {
      return new Response('content or title empty', { status: 400 });
    }

    // 使用fetch直接调用OpenAI API
    const prompt = `FactLens-EN-v2
Title:${title}
Credibility:X/10
Facts:1.conf:0.XX<fact>sentence</fact>
Opinions:1.conf:0.XX<opinion>sentence</opinion>
Bias:-E:N conf:0.XX -B:N -M:N -F:N -Stance:neutral/leaning X%
Pub:xxx(≤15w) PR:xxx(≤8w) Sum:xxx(≤8w)
Text:${content}`.trim();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(JSON.stringify({ error: errorData }), { status: response.status });
    }

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    console.error('API Error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}



