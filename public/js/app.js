/* public/js/app.js  (ESM)  Final */
const $ = s => document.querySelector(s);
const url = '/api/chat';

let radarChart; 
let isAnalyzing = false; 
const COOL_DOWN = 1200;
const ui = { 
  input: $('#urlInput'), 
  btn: $('#analyzeBtn'), 
  progress: $('#progress'), 
  summary: $('#summary'), 
  fourDim: $('#fourDim'), 
  results: $('#results'), 
  fact: $('#factList'), 
  opinion: $('#opinionList'), 
  bias: $('#biasList'), 
  pub: $('#pubAdvice'), 
  pr: $('#prAdvice'), 
  radarEl: $('#radar'), 
  radarTgl: $('#radarToggle') 
};

/* ===== 浏览器 LRU 48 h ===== */
const LRU = new Map(); 
const LRU_TTL = 48 * 3600 * 1000;
async function hash(str) { 
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); 
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); 
}
async function getCache(content, title) { 
  const key = await hash(content + title); 
  const hit = LRU.get(key); 
  if (hit && Date.now() - hit.ts < LRU_TTL) return hit.report; 
  return null; 
}
async function setCache(content, title, report) { 
  const key = await hash(content + title); 
  LRU.set(key, { ts: Date.now(), report }); 
  if (LRU.size > 2000) LRU.delete(LRU.keys().next().value); 
}

/* 英文词典校正 */
let enEmoDict = {}; 
fetch('/dict/en-emotionDict.json')
  .then(r => r.json())
  .then(d => {
    enEmoDict = d.reduce((acc, item) => {
      acc[item.word] = { intensity: item.intensity, polarity: item.polarity };
      return acc;
    }, {});
    console.log('情感词典加载完成，共', Object.keys(enEmoDict).length, '个词条');
  })
  .catch(err => console.error('情感词典加载失败:', err));

function correctEmotionEN(rawEmo, text) { 
  if (!text || !enEmoDict) return rawEmo; 
  const tokens = text.toLowerCase().match(/\b[\w']+\b/g) || []; 
  let maxPhrase = 0; 
  for (let n = 1; n <= 3; n++) { 
    for (let i = 0; i <= tokens.length - n; i++) { 
      const w = tokens.slice(i, i + n).join(' '); 
      if (enEmoDict[w]) maxPhrase = Math.max(maxPhrase, enEmoDict[w].intensity); 
    } 
  } 
  return Math.max(rawEmo, maxPhrase); 
}

// 显示进度条
function showProgress() {
  ui.progress.classList.remove('hidden');
  ui.summary.classList.add('hidden');
  ui.fourDim.classList.add('hidden');
  ui.results.classList.add('hidden');
  document.getElementById('pct').textContent = '0';
  document.getElementById('progressInner').style.width = '0%';
}

// 隐藏进度条
function hideProgress() {
  ui.progress.classList.add('hidden');
}

// 获取网页内容的函数（简化版，实际项目中可能需要更复杂的逻辑）
async function fetchContent(input) {
  // 如果输入是URL，则提取内容，否则直接返回输入内容
  if (input.startsWith('http')) {
    // 这里应该有获取网页内容的逻辑，但简化为返回输入
    return { content: input, title: 'Web Page' };
  } else {
    return { content: input, title: 'User Input' };
  }
}

// 解析API返回的结果
function parseResult(resultText) {
  try {
    // 简化解析逻辑，实际项目中需要根据API返回格式进行解析
    const lines = resultText.split('\n');
    const parsed = {
      credibility: 0,
      facts: [],
      opinions: [],
      bias: [],
      publisherAdvice: '',
      prReply: '',
      summary: '',
      dimensions: { ts: 0, fd: 0, eb: 0, cs: 0 }
    };

    // 解析可信度
    const credibilityMatch = resultText.match(/Credibility:(\d+(?:\.\d+)?)/);
    if (credibilityMatch) {
      parsed.credibility = parseFloat(credibilityMatch[1]);
    }

    // 解析事实
    const factsMatches = resultText.match(/<fact>(.*?)<\/fact>/g);
    if (factsMatches) {
      parsed.facts = factsMatches.map(fact => fact.replace(/<\/?fact>/g, ''));
    }

    // 解析观点
    const opinionsMatches = resultText.match(/<opinion>(.*?)<\/opinion>/g);
    if (opinionsMatches) {
      parsed.opinions = opinionsMatches.map(op => op.replace(/<\/?opinion>/g, ''));
    }

    // 解析偏见
    const biasMatches = resultText.match(/Bias:.*?(?=\n\n|$)/g);
    if (biasMatches) {
      parsed.bias = biasMatches;
    }

    // 解析发布商建议
    const pubMatch = resultText.match(/Pub:(.*?)(?=\nPR:|$)/s);
    if (pubMatch) {
      parsed.publisherAdvice = pubMatch[1].trim();
    }

    // 解析公关回复
    const prMatch = resultText.match(/PR:(.*?)(?=\nSum:|$)/s);
    if (prMatch) {
      parsed.prReply = prMatch[1].trim();
    }

    // 解析总结
    const sumMatch = resultText.match(/Sum:(.*?)(?=\n|$)/s);
    if (sumMatch) {
      parsed.summary = sumMatch[1].trim();
    }

    // 解析四维度
    const tsMatch = resultText.match(/Source Credibility:(\d+(?:\.\d+)?)/);
    const fdMatch = resultText.match(/Fact Density:(\d+(?:\.\d+)?)/);
    const ebMatch = resultText.match(/Emotional Neutrality:(\d+(?:\.\d+)?)/);
    const csMatch = resultText.match(/Consistency:(\d+(?:\.\d+)?)/);
    
    parsed.dimensions = {
      ts: tsMatch ? parseFloat(tsMatch[1]) : 0,
      fd: fdMatch ? parseFloat(fdMatch[1]) : 0,
      eb: ebMatch ? parseFloat(ebMatch[1]) : 0,
      cs: csMatch ? parseFloat(csMatch[1]) : 0
    };

    return parsed;
  } catch (e) {
    console.error('解析结果失败:', e);
    return {
      credibility: 0,
      facts: ['解析失败'],
      opinions: ['解析失败'],
      bias: ['解析失败'],
      publisherAdvice: '解析失败',
      prReply: '解析失败',
      summary: '解析失败',
      dimensions: { ts: 0, fd: 0, eb: 0, cs: 0 }
    };
  }
}

// 渲染结果
function render(report) {
  try {
    console.log('渲染结果:', report);
    
    // 显示摘要
    ui.summary.textContent = report.summary || '分析完成';
    ui.summary.classList.remove('hidden');

    // 显示四维度
    if (report.dimensions) {
      ui.fourDim.classList.remove('hidden');
      
      // 更新四维度条形图
      document.getElementById('tsVal').textContent = report.dimensions.ts.toFixed(1);
      document.getElementById('fdVal').textContent = report.dimensions.fd.toFixed(1);
      document.getElementById('ebVal').textContent = report.dimensions.eb.toFixed(1);
      document.getElementById('csVal').textContent = report.dimensions.cs.toFixed(1);
      
      document.getElementById('tsBar').style.width = `${Math.min(100, report.dimensions.ts * 10)}%`;
      document.getElementById('fdBar').style.width = `${Math.min(100, report.dimensions.fd * 10)}%`;
      document.getElementById('ebBar').style.width = `${Math.min(100, report.dimensions.eb * 10)}%`;
      document.getElementById('csBar').style.width = `${Math.min(100, report.dimensions.cs * 10)}%`;
    }

    // 清空并填充结果列表
    ui.fact.innerHTML = '';
    ui.opinion.innerHTML = '';
    ui.bias.innerHTML = '';
    
    if (report.facts && report.facts.length > 0) {
      report.facts.forEach(fact => {
        const li = document.createElement('li');
        li.textContent = fact;
        ui.fact.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = '未检测到明确的事实';
      ui.fact.appendChild(li);
    }

    if (report.opinions && report.opinions.length > 0) {
      report.opinions.forEach(op => {
        const li = document.createElement('li');
        li.textContent = op;
        ui.opinion.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = '未检测到明确的观点';
      ui.opinion.appendChild(li);
    }

    if (report.bias && report.bias.length > 0) {
      report.bias.forEach(b => {
        const li = document.createElement('li');
        li.textContent = b;
        ui.bias.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = '未检测到明显的偏见';
      ui.bias.appendChild(li);
    }

    // 填充发布商建议和公关回复
    document.getElementById('pubAdvice').textContent = report.publisherAdvice || '暂无建议';
    document.getElementById('prAdvice').textContent = report.prReply || '暂无回复';

    // 显示结果区域
    ui.results.classList.remove('hidden');
  } catch (e) {
    console.error('渲染结果失败:', e);
    alert('渲染结果时出现错误: ' + e.message);
  }
}

// 分析内容函数
async function analyzeContent(content, title) {
  try {
    console.log('开始分析内容:', { content: content.substring(0, 100) + '...', title });
    
    // 模拟进度更新
    const progressInterval = setInterval(() => {
      const currentWidth = parseFloat(document.getElementById('progressInner').style.width || '0');
      if (currentWidth < 90) {
        const newWidth = Math.min(90, currentWidth + 5);
        document.getElementById('progressInner').style.width = newWidth + '%';
        document.getElementById('pct').textContent = Math.round(newWidth);
      }
    }, 500);
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, title })
    });
    
    clearInterval(progressInterval);
    document.getElementById('progressInner').style.width = '95%';
    document.getElementById('pct').textContent = '95';
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API响应错误:', response.status, errorText);
      throw new Error(`API请求失败: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('API响应数据:', data);
    
    document.getElementById('progressInner').style.width = '100%';
    document.getElementById('pct').textContent = '100';
    
    // 模拟解析结果
    const resultText = data.choices?.[0]?.message?.content || 
                      (data && typeof data === 'object' ? JSON.stringify(data) : String(data));
    
    console.log('原始结果文本:', resultText);
    
    const parsedResult = parseResult(resultText);
    console.log('解析后的结果:', parsedResult);
    
    return parsedResult;
  } catch (e) {
    console.error('分析内容失败:', e);
    clearInterval(progressInterval);
    throw e;
  }
}

// 主处理函数
async function handleAnalyze() {
  const raw = ui.input.value.trim(); 
  if (!raw) {
    alert('请输入要分析的内容');
    return; 
  }
  
  if (isAnalyzing) {
    console.log('分析正在进行中，请稍候...');
    return;
  }
  
  isAnalyzing = true;
  ui.btn.disabled = true;
  ui.btn.textContent = 'Analyzing...';
  
  showProgress();
  
  try {
    console.log('开始获取内容...');
    const { content, title } = await fetchContent(raw);
    console.log('获取内容完成:', { content: content.substring(0, 100) + '...', title });
    
    // LRU缓存检查
    const cached = await getCache(content, title);
    if (cached) {
      console.log('使用缓存结果');
      render(cached);
      return;
    }
    
    console.log('执行实时分析...');
    const report = await analyzeContent(content, title);
    console.log('分析完成，保存到缓存');
    await setCache(content, title, report);
    render(report);
  } catch (e) {
    console.error('处理分析失败:', e);
    alert('分析失败: ' + e.message);
    ui.summary.textContent = '分析失败: ' + e.message;
    ui.summary.classList.remove('hidden');
  } finally {
    hideProgress();
    isAnalyzing = false;
    ui.btn.disabled = false;
    ui.btn.textContent = 'Analyze';
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('页面加载完成，初始化事件监听器');
  ui.btn.addEventListener('click', handleAnalyze);
  
  // 支持回车键触发分析
  ui.input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAnalyze();
    }
  });
  
  // 检查API可用性
  checkApiStatus();
});

// 检查API状态
async function checkApiStatus() {
  try {
    const response = await fetch('/api/chat', {
      method: 'OPTIONS' // 使用OPTIONS方法检查API端点
    });
    console.log('API端点状态:', response.status);
  } catch (e) {
    console.error('API连接测试失败:', e);
    console.warn('API可能无法访问，请检查后端配置');
  }
}



