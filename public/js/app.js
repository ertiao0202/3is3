/* public/js/app.js  (ESM) */
const $ = s => document.querySelector(s);
const url = '/api/chat';

let radarChart;
let isAnalyzing = false;
const COOL_DOWN = 1200;

const ui = {
  input   : $('#urlInput'),
  btn     : $('#analyzeBtn'),
  progress: $('#progress'),
  summary : $('#summary'),
  fourDim : $('#fourDim'),
  results : $('#results'),
  fact    : $('#factList'),
  opinion : $('#opinionList'),
  bias    : $('#biasList'),
  pub     : $('#pubAdvice'),
  pr      : $('#prAdvice'),
  radarEl : $('#radar'),
  radarTgl: $('#radarToggle')
};

/* 自动增高 */
const tx = ui.input;
tx.addEventListener('input', () => {
  tx.style.height = 'auto';
  tx.style.height = tx.scrollHeight + 'px';
});

/* 工具函数 */
function smoothNeutrality(n){
  if (n <= 2)  return 10 - n * 0.5;
  if (n <= 5)  return 9   - (n - 2) * 1.2;
  if (n <= 9)  return 5.4 - (n - 5) * 0.9;
  return Math.max(0, 1.2 - (n - 9) * 0.15);
}
function listConf(ul, arr){
  if (!arr.length) {
    ul.innerHTML = '<li>（保底）无显式句子</li>';
    return;
  }
  ul.innerHTML = arr.map(item => {
    const c = item.conf;
    let cls = '';
    if (c >= 0.8) cls = 'conf-high';
    else if (c >= 0.5) cls = 'conf-mid';
    else cls = 'conf-low';
    return `<li class="${cls}" title="confidence ${(c*100).toFixed(0)}%">${item.text}</li>`;
  }).join('');
}
function bias(ul, b){
  ul.innerHTML = `
    <li>Emotional words: ${b.emotional}</li>
    <li>Binary opposition: ${b.binary}</li>
    <li>Mind-reading: ${b.mind}</li>
    <li>Logical fallacy: ${b.fallacy}</li>
    <li>Overall stance: ${b.stance}</li>
  `;
}
function showSummary(txt){
  ui.summary.textContent = txt;
  ui.summary.classList.remove('hidden');
}

/* 进度条 */
let pctTick = null;
function showProgress(){
  if (pctTick) clearInterval(pctTick);
  ui.progress.classList.remove('hidden');
  ui.fourDim.classList.add('hidden');
  ui.results.classList.add('hidden');
  ui.summary.classList.add('hidden');
  $('#pct').textContent = '0';
  $('#progressInner').style.width = '0%';
  let pct = 0;
  pctTick = setInterval(() => {
    pct += 2;
    if (pct > 99) pct = 99;
    $('#pct').textContent = pct;
    $('#progressInner').style.width = Math.min(pct, 100) + '%';
  }, 120);
}
function hideProgress(){
  clearInterval(pctTick);
  pctTick = null;
  ui.progress.classList.add('hidden');
}

/* 四维度条形图 */
function drawBars({ transparency, factDensity, emotion, consistency }){
  const max = 10;
  document.getElementById('tsVal').textContent = transparency.toFixed(1);
  document.getElementById('fdVal').textContent = factDensity.toFixed(1);
  document.getElementById('ebVal').textContent = emotion.toFixed(1);
  document.getElementById('csVal').textContent = consistency.toFixed(1);
  document.getElementById('tsBar').style.width = `${(transparency / max) * 100}%`;
  document.getElementById('fdBar').style.width = `${(factDensity / max) * 100}%`;
  document.getElementById('ebBar').style.width = `${(emotion / max) * 100}%`;
  document.getElementById('csBar').style.width = `${(consistency / max) * 100}%`;
}

/* 雷达图展开/收起 */
ui.radarTgl.addEventListener('click', () => {
  const isHidden = ui.radarEl.classList.contains('hidden');
  ui.radarTgl.textContent = isHidden ? 'Hide Radar Chart' : 'View Radar Chart';
  ui.radarEl.classList.toggle('hidden', !isHidden);
  if (isHidden && !radarChart) {
    const data = [
      Number(document.getElementById('tsVal').textContent),
      Number(document.getElementById('fdVal').textContent),
      Number(document.getElementById('ebVal').textContent),
      Number(document.getElementById('csVal').textContent)
    ];
    drawRadar(data);
  }
});

function drawRadar(data){
  if (typeof window.Chart === 'undefined'){ console.warn('Chart.js not loaded'); return; }
  if (radarChart) radarChart.destroy();
  radarChart = new Chart(ui.radarEl, {
    type:'radar',
    data:{
      labels:['Credibility','Fact Density','Neutrality','Consistency'],
      datasets:[{
        label:'Score',
        data: data,
        backgroundColor:'rgba(37,99,235,0.2)',
        borderColor:'#2563eb',
        pointBackgroundColor:'#2563eb'
      }]
    },
    options:{ scales:{ r:{ suggestedMin:0, suggestedMax:10 } }, plugins:{ legend:{ display:false } } }
  });
}

/* ========== 把报告画到页面 ========== */
function render(r){
  drawBars({
    transparency : smoothNeutrality(r.credibility),
    factDensity  : r.facts.length  * 1.2,
    emotion      : Math.max(0, 10 - (r.bias.emotional || 0) * 2),
    consistency  : 10 - (r.bias.fallacy || 0) * 0.8
  });
  listConf(ui.fact,    r.facts);
  listConf(ui.opinion, r.opinions);
  bias(ui.bias, r.bias);
  showSummary(r.summary);
  ui.pub.textContent = r.publisher;
  ui.pr.textContent  = r.pr;
  ui.fourDim.classList.remove('hidden');
  ui.results.classList.remove('hidden');
}

/* 主流程 */
async function handleAnalyze(){
  console.log('【1】按钮被点到了');
  const raw = ui.input.value.trim();
  if (!raw){ hideProgress(); return; }

  isAnalyzing = true;
  showProgress();
  try {
    const { content, title } = await fetchContent(raw);
    const report = await analyzeContent(content, title);
    render(report);
  } catch (e) {
    console.error(e);
    let msg = 'We could not retrieve the page. Please paste text directly.';
    if (e.message.includes('timeout') || e.message.includes('504'))
      msg = 'Too slow response (>10 s). Try pasting 2-3 paragraphs instead of the full article.';
    showSummary(msg);
    await new Promise(r => setTimeout(r, COOL_DOWN));
  } finally {
    hideProgress();
    isAnalyzing = false;
  }
}

async function fetchContent(raw){
  if (!raw.startsWith('http')) return { content: raw.slice(0,2000), title: 'Pasted text' };
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 10000);
  try{
    const res = await fetch(`https://r.jina.ai/${encodeURIComponent(raw)}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('jina fetch failed');
    const txt = await res.text();
    return { content: txt.slice(0, 2000), title: raw };
  }catch(e){
    clearTimeout(timer);
    throw e;
  }
}

async function analyzeContent(content, title){
  const prompt = `Role: You are "FactLens", a fact-opinion-bias detector.
You must strictly follow the output format below and keep the order.

Title: ${title}
Credibility: X/10 (one sentence)

Facts:
1. conf:0.XX <fact>sentence</fact>
… (≥1)

Opinions:
1. conf:0.XX <opinion>sentence</opinion>
… (≥1)

Bias:
- Emotional: N  conf:0.XX
- Binary: N     conf:0.XX
- Mind-reading: N conf:0.XX
- Fallacy: N    conf:0.XX
- Stance: neutral/leaning/critical X%

Publisher tip: xxx (verb-first, ≤100)
PR tip: xxx (≤30 words)

Summary: xxx (≤20 words)

Confidence rule (must obey):
- 0.95-1.00: direct from official docs, public reports, laws
- 0.80-0.94: credible third-party source, simple calculation
- 0.50-0.79: widely accepted but no primary source
- 0.30-0.49: partly disputed, weak evidence
- 0.10-0.29: highly speculative, model completion
- 0.00-0.09: almost no basis, pure assumption

【格式死命令】
每条必须以「序号. conf:0.XX <fact>」或「序号. conf:0.XX <opinion>」开头，conf:0.XX 不可省略！

Text:
${content}`;
  const body = { model: 'moonshot-v1-8k', messages:[{role:'user', content:prompt}], temperature:0, max_tokens:1500 };
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  const json = await res.json();
  return parseReport(json.choices[0].message.content);
}

function parseReport(md){
  const r = { facts:[], opinions:[], bias:{}, summary:'', publisher:'', pr:'', credibility:8 };

  const cred = md.match(/Credibility:\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (cred) r.credibility = parseFloat(cred[1]);

  /* ====  Facts  ==== */
  const fBlock = md.match(/Facts:([\s\S]*?)Opinions:/);
  if (fBlock) {
    r.facts = fBlock[1].split('\n')
             .filter(l => l.includes('<fact') && l.includes('conf:'))
             .map(l => {
               const conf = (l.match(/conf:([\d.]+)/) || [,1])[1];
               const txt  = l.replace(/^\d+\.\s*conf:[\d.]+\s*<fact[^>]*>(.*?)<\/fact>.*/, '$1').trim();
               return { text: txt, conf: parseFloat(conf) };
             });
  }
  if (!r.facts.length) r.facts = [{text:'(保底) No explicit facts detected',conf:0.5}];

  /* ====  Opinions  ==== */
  const oBlock = md.match(/Opinions:([\s\S]*?)Bias:/);
  if (oBlock) {
    r.opinions = oBlock[1].split('\n')
              .filter(l => l.includes('<opinion') && l.includes('conf:'))
              .map(l => {
                const conf = (l.match(/conf:([\d.]+)/) || [,1])[1];
                const txt  = l.replace(/^\d+\.\s*conf:[\d.]+\s*<opinion[^>]*>(.*?)<\/opinion>.*/, '$1').trim();
                return { text: txt, conf: parseFloat(conf) };
              });
  }
  if (!r.opinions.length) r.opinions = [{text:'(保底) No explicit opinions detected',conf:0.5}];

  /* ====  Bias  ==== */
  const bBlock = md.match(/Bias:([\s\S]*?)Publisher tip:/);
  if (bBlock){
    const b = bBlock[1];
    r.bias = {
      emotional : (b.match(/Emotional:\s*(\d+)/)||[,0])[1],
      binary    : (b.match(/Binary:\s*(\d+)/)||[,0])[1],
      mind      : (b.match(/Mind-reading:\s*(\d+)/)||[,0])[1],
      fallacy   : (b.match(/Fallacy:\s*(\d+)/)||[,0])[1],
      stance    : (b.match(/Stance:\s*(.+?)\s*(?:\n|$)/)||[, 'neutral 0%'])[1]
    };
  }
  if (!r.bias.emotional) r.bias = {emotional:0,binary:0,mind:0,fallacy:0,stance:'unknown'};

  const pub = md.match(/Publisher tip:\s*(.+?)\s*(?:PR tip|$)/);
  if (pub) r.publisher = pub[1].trim();
  if (!r.publisher) r.publisher = '(保底) Publisher tip not generated';

  const pr  = md.match(/PR tip:\s*(.+?)\s*(?:Summary|$)/);
  if (pr) r.pr = pr[1].split('[DATE]')[0].trim();
  if (!r.pr) r.pr = '(保底) PR reply not generated';

  const sum = md.match(/Summary:\s*(.+)/);
  if (sum) r.summary = sum[1].trim();
  if (!r.summary) r.summary = '(保底) Summary not generated';

  return r;
}

/* 事件绑定 */
window.addEventListener('DOMContentLoaded', () => {
  ui.btn.addEventListener('click', () => {
    console.log('【2】click 事件已触发');
    handleAnalyze();
  });
});
