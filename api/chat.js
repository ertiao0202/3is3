// api/chat.js  Node.js Runtime - 诊断版
export const runtime = 'nodejs';

const MODEL = 'moonshot-v1-8k@quant';
const apiKey = process.env.KIMI_API_KEY;

let _redis; // 懒加载实例
function redis() {
  if (_redis) return _redis;
  try {
    const { Redis } = require('@upstash/redis');
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REST_TOKEN,
      retry: { retries: 0 },
    });
    return _redis;
  } catch (e) {
    console.error('Redis初始化失败:', e.message);
    return null; // 返回null而不是抛出错误
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
  console.log('API调用开始');
  
  if (req.method !== 'POST') {
    console.log('方法不允许:', req.method);
    return new Response('Method Not Allowed', { status: 405 });
  }
  
  console.log('API密钥存在:', !!apiKey);
  console.log('Redis配置存在:', !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REST_TOKEN));
  
  if (!apiKey) {
    console.error('缺少KIMI_API_KEY');
    return new Response('Missing KIMI_API_KEY', { status: 500 });
  }

  try {
    const body = await req.json();
    console.log('请求体:', { contentLength: body.content?.length, title: body.title });
    
    const { content, title } = body;
    if (!content || !title) {
      console.error('内容或标题为空');
      return new Response('content or title empty', { status: 400 });
    }

    // 检查Redis连接
    const redisClient = redis();
    if (redisClient) {
      console.log('Redis连接正常');
      const key = `cache:${Buffer.from(content + title).toString('base64').slice(0, 32)}`;
      const cached = await redisClient.get(key);
      if (cached) {
        console.log('返回缓存结果');
        return new Response(cached, { 
          headers: { 
            'content-type': 'application/json', 
            'X-Cache': 'HIT' 
          } 
        });
      }
    } else {
      console.log('Redis连接失败，跳过缓存');
    }

    const prompt = buildPrompt(content, title);
    console.log('构建的提示词长度:', prompt.length);
    
    const payload = { 
      model: MODEL, 
      messages: [{ role: 'user', content: prompt }], 
      temperature: 0, 
      max_tokens: 600 
    };

    console.log('发送请求到Moonshot API...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('请求超时');
      controller.abort();
    }, 30000); // 30秒超时
    
    try {
      const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        signal: controller.signal,
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${apiKey}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(payload),
      });
      
      clearTimeout(timeoutId);
      
      console.log('API响应状态:', res.status);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('API响应错误:', res.status, errorText);
        throw new Error(`API Error: ${res.status} - ${errorText}`);
      }
      
      const answer = await res.json();
      console.log('API响应成功，数据长度:', JSON.stringify(answer).length);
      
      if (redisClient) {
        const str = JSON.stringify(answer);
        await redisClient.set(key, str, { ex: 86400 });
        console.log('结果已缓存');
      }
      
      return new Response(JSON.stringify(answer), { 
        headers: { 
          'content-type': 'application/json', 
          'X-Cache': 'MISS' 
        } 
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('请求失败:', fetchError.message);
      
      // 如果是超时错误，返回一个模拟响应
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: "Summary: Analysis timed out. Please try again later.\n\nFacts: []\nOpinions: []\nBias: []\nPub: No publisher advice available\nPR: No PR reply available\nSum: Analysis could not complete due to timeout"
            }
          }]
        }), { 
          headers: { 
            'content-type': 'application/json' 
          } 
        });
      }
      
      throw fetchError;
    }
  } catch (e) {
    console.error('处理请求时出错:', e);
    return new Response(e.message, { status: 500 });
  }
}



