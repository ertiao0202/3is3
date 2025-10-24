/* public/js/app.js  (ESM)  Final */
const $ = s => document.querySelector(s);
const url = '/api/chat';

let radarChart; const isAnalyzing = false; const COOL_DOWN = 1200;
const ui = { input: $('#urlInput'), btn: $('#analyzeBtn'), progress: $('#progress'), summary: $('#summary'), fourDim: $('#fourDim'), results: $('#results'), fact: $('#factList'), opinion: $('#opinionList'), bias: $('#biasList'), pub: $('#pubAdvice'), pr: $('#prAdvice'), radarEl: $('#radar'), radarTgl: $('#radarToggle') };

/* ===== 浏览器 LRU 48 h ===== */
const LRU = new Map(); const LRU_TTL = 48 * 3600 * 1000;
async function hash(str) { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function getCache(content, title) { const key = await hash(content + title); const hit = LRU.get(key); if (hit && Date.now() - hit.ts < LRU_TTL) return hit.report; return null; }
async function setCache(content, title, report) { const key = await hash(content + title); LRU.set(key, { ts: Date.now(), report }); if (LRU.size > 2000) LRU.delete(LRU.keys().next().value); }

/* 英文词典校正 */
let enEmoDict = {}; fetch('/dict/en-emotionDict.json').then(r => r.json()).then(d => enEmoDict = d);
function correctEmotionEN(rawEmo, text) { if (!text || !enEmoDict) return rawEmo; const tokens = text.toLowerCase().match(/\b[\w']+\b/g) || []; let maxPhrase = 0; for (let n = 1; n <= 3; n++) { for (let i = 0; i <= tokens.length - n; i++) { const w = tokens.slice(i, i + n).join(' '); if (enEmoDict[w]) maxPhrase = Math.max(maxPhrase, enEmoDict[w]); } } return Math.max(rawEmo, maxPhrase); }

/* 其余原逻辑省略，仅贴调用点 */
async function handleAnalyze() {
  const raw = ui.input.value.trim(); if (!raw) return; isAnalyzing = true; showProgress();
  try {
    const { content, title } = await fetchContent(raw);
    // ---------- LRU 秒开 ----------
    const cached = await getCache(content, title);
    if (cached) { render(cached); hideProgress(); isAnalyzing = false; return; }
    // ---------- 实时 ----------
    const report = await analyzeContent(content, title);
    await setCache(content, title, report);
    render(report);
  } catch (e) { ... } finally { hideProgress(); isAnalyzing = false; }
}
window.addEventListener('DOMContentLoaded', () => ui.btn.addEventListener('click', handleAnalyze));
