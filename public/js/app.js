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
function smoothNeutrality(n = 0){
  if (n <= 2)  return 10 - n * 0.5;
  if (n <= 5)  return 9   - (n - 2) * 1.2;
  if (n <= 9)  return 5.4 - (n - 5) * 0.9;
  return Math.max(0, 1.2 - (n - 9) * 0.15);
}
function listConf(ul, arr){
  if (!arr.length) {
    ul.innerHTML = '<li>None detected</li>';
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
  ui.radarEl.classList.toggle('hidden', !isHidden);
  ui.radarTgl.textContent = isHidden ? 'Hide Radar Chart' : 'View Radar Chart';
  if (isHidden && !radarChart) { /* 首次展开才绘制 */
    const data = [
      +document.getElementById('tsVal').textContent,
      +document.getElementById('fdVal').textContent,
      +document.getElementById('ebVal').textContent,
      +document.getElementById('csVal').textContent
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
        data,
        backgroundColor:'rgba(37,99,235,0.2)',
        borderColor:'#2563eb',
        pointBackgroundColor:'#2563eb'
      }]
    },
    options:{ scales:{ r:{ suggestedMin:0, suggestedMax:10 } }, plugins:{ legend:{ display:false } } }
  });
}

/* 主流程 */
async function handleAnalyze(){
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
  const prompt = `System:
You are FactLens, an impartial English-content auditor.
Output MUST follow the JSON schema below; extra keys or line breaks will break parsing.
If primary language ≠ English, return ERROR:NON_ENGLISH.

Examples of emotional attack:
moron,idiot,dumbass,jackass,scumbag,prick,tosser,wanker,muppet,pillock,git,plonker,bogan,drongo,yobbo,galah,knobhead,bellend,nonce,ratbag,bloody idiot,clown,joke,laughing stock,disgrace,embarrassment,pathetic,clueless,brainless,thick,dim,dense,delusional,paranoid,hack,shill,grifter,conman,fraud,liar,cheat,snake,weasel,rat,cockroach,parasite,leech,bottom-feeder,scum,trash,garbage,dumpster fire,train wreck,basket case,joke of a leader,waste of space,oxygen thief,stain,blight,cancer

Examples of binary opposition:
enemy of the people,enemy of the state,traitor,treasonous,un-American,anti-American,un-Australian,un-British,anti-vax,climate denier,libtard,republitard,demorat,RINO,DINO,leftard,rightard,socialist scum,commie,Marxist,fascist,Nazi,Hitler wannabe,Stalinist,dictator-lover,Putin puppet,CCP shill,Beijing stooge,Brussels puppet,globalist elite,coastal elite,beltway insider,deep state,swamp creature,champagne socialist,chardonnay socialist,latte-sipping lefty,inner-city greenie,Tory scum,Labour parasite

Task:
1. Core message: ≤25 words, third-person, no "the author/article".
2. Split sentences; tag each as <fact> or <opinion>.
   Prepend conf:0.XX (confidence 00-99).
3. Bias signals (count only if confidence ≥0.5):
   a) Emotional attack: derogatory/insulting tone (exclude humor/sarcasm).
   b) Binary opposition: us-vs-them, hostile labels as listed above.
   c) Mind-reading: claims about motives without evidence.
   d) Logical fallacy: ad hominem, straw man, slippery slope, false dilemma.
   For each give count, max-conf (0-1), and shortest possible snippet.
4. Credibility: 0–10 relative to English-language news average (5 = average).
5. Publisher tip: verb-first, ≤80 chars, no quotes.
6. PR reply: ≤30 words, include source/date placeholder [DATE].
7. Summary: ≤20 words, neutral voice.

Output schema (fill values only):
-----
Core: <string>
Credibility: <0-10>
Facts:
1. conf:0.XX <fact>sentence</fact>
...
Opinions:
1. conf:0.XX <opinion>sentence</opinion>
...
Bias:
 emotional: {count}/{conf}/{snippet}
 binary: {count}/{conf}/{snippet}
 mind: {count}/{conf}/{snippet}
 fallacy: {count}/{conf}/{type}/{snippet}
 stance: neutral|leaning-left|leaning-right|critical-left|critical-right
Tip: <string>
PR: <string>
Summary: <string>
-----

Title: ${title}
Text:
${content}`;

  const body = { model: 'moonshot-v1-8k', messages:[{role:'user', content:prompt}], temperature:0.15, max_tokens:1200 };
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  const json = await res.json();
  return parseReport(json.choices[0].message.content);
}

function parseReport(md){
  const r = { facts:[], opinions:[], bias:{ emotional:0, binary:0, mind:0, fallacy:0, stance:'neutral 0%' }, summary:'', publisher:'', pr:'', credibility:8 };
  const cred = md.match(/Credibility:\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (cred) r.credibility = parseFloat(cred[1]);
  const fBlock = md.match(/Facts:([\s\S]*?)Opinions:/);
  if (fBlock) {
    r.facts = fBlock[1].split('\n')
             .filter(l => l.includes('<fact>'))
             .map(l => {
               const conf = (l.match(/conf:([\d.]+)/) || [,1])[1];
               const txt  = l.replace(/^\d+\.\s*conf:[\d.]+\s*<fact>(.*)<\/fact>.*/, '$1').trim();
               return { text: txt, conf: parseFloat(conf) };
             });
  }
  const oBlock = md.match(/Opinions:([\s\S]*?)Bias:/);
  if (oBlock) {
    r.opinions = oBlock[1].split('\n')
              .filter(l => l.includes('<opinion>'))
              .map(l => {
                const conf = (l.match(/conf:([\d.]+)/) || [,1])[1];
                const txt  = l.replace(/^\d+\.\s*conf:[\d.]+\s*<opinion>(.*)<\/opinion>.*/, '$1').trim();
                return { text: txt, conf: parseFloat(conf) };
              });
  }
  const bBlock = md.match(/Bias:([\s\S]*?)Publisher tip:/);
  if (bBlock){
    const b = bBlock[1];
    r.bias.emotional = parseInt((b.match(/Emotional words?:\s*(\d+)/i)  || [,0])[1], 10);
    r.bias.binary    = parseInt((b.match(/Binary opposition:\s*(\d+)/i) || [,0])[1], 10);
    r.bias.mind      = parseInt((b.match(/Mind-reading:\s*(\d+)/i)        || [,0])[1], 10);
    r.bias.fallacy   = parseInt((b.match(/Logical fallacy:\s*(\d+)/i)     || [,0])[1], 10);
    r.bias.stance    = (b.match(/Overall stance:\s*(.+?)\s*(?:\n|$)/i) || [, 'neutral 0%'])[1];
  }
  const pub = md.match(/Publisher tip:\s*(.+?)\s*(?:PR tip|$)/);
  if (pub) r.publisher = pub[1].trim();
  const pr  = md.match(/PR tip:\s*(.+?)\s*(?:Summary|$)/);
  if (pr) r.pr = pr[1].trim();
  const sum = md.match(/Summary:\s*(.+)/);
  if (sum) r.summary = sum[1].trim();
  return r;
}

function render(r){
  showSummary(r.summary);
  const ts = Math.min(10, 0.5 + (r.credibility || 8));
  const fd = Math.min(10, 1.5 + (r.facts.length || 0) * 1.8);
  const ebRaw = (Number(r.bias.emotional) + Number(r.bias.binary) + Number(r.bias.mind));
  const eb = smoothNeutrality(ebRaw);
  const cs = Math.min(10, 0.5 + (ts + fd + eb) / 3);
  drawBars({ transparency: ts, factDensity: fd, emotion: eb, consistency: cs });
  // 雷达图数据先存起来，等用户首次点击再画
  ui.radarEl.dataset.ready = 'true';
  listConf(ui.fact,    r.facts);
  listConf(ui.opinion, r.opinions);
  bias(ui.bias,    r.bias);
  ui.pub.textContent = r.publisher;
  ui.pr.textContent  = r.pr;
  ui.fourDim.classList.remove('hidden');
  ui.results.classList.remove('hidden');
}

/* 事件绑定 */
document.addEventListener('DOMContentLoaded', () => {
  ui.btn.addEventListener('click', handleAnalyze);
  ui.input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAnalyze();
    }
  });
});
