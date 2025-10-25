// api/chat.js  Node.js Runtime - 模拟版
export const runtime = 'nodejs';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const { content, title } = body;
    
    if (!content || !title) {
      return new Response('content or title empty', { status: 400 });
    }

    // 模拟API延迟
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 返回模拟结果
    const mockResponse = {
      choices: [{
        message: {
          content: `Summary: This is a sample analysis of the provided content. The text discusses various aspects of the topic with mixed sentiment and moderate bias.\n\nFacts: 1. <fact>The content mentions specific details about the topic</fact> 2. <fact>There are measurable aspects mentioned in the text</fact>\n\nOpinions: 1. <opinion>The author expresses a particular viewpoint on the subject</opinion> 2. <opinion>There are subjective assessments made in the text</opinion>\n\nBias: -E:Neutral -B:Negative -M:Medium -F:Factual -Stance:slightly leaning 30%\n\nPub: The publisher should provide more balanced perspectives and verify claims. PR: Consider addressing concerns raised and providing additional context.\n\nCredibility:7.5/10\nSource Credibility:8.0/10\nFact Density:7.0/10\nEmotional Neutrality:6.5/10\nConsistency:8.5/10`
        }
      }]
    };

    return new Response(JSON.stringify(mockResponse), { 
      headers: { 
        'content-type': 'application/json',
        'X-Cache': 'MISS' 
      } 
    });
  } catch (e) {
    console.error('处理请求时出错:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}



