/* 在青春长大网页里：收集活动卡片文字 + 页面接口返回，交给后台写库 */
(() => {
  if (window.__qczdInjected) return;
  window.__qczdInjected = true;

  const BLOCKS = ['劳育', '美育', '创新', '德育', '体育', '其他'];

  let xhrCache = [];

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.type !== 'qczd-dump-result') return;
    xhrCache = e.data.data || [];
  });

  function askXhr() {
    xhrCache = [];
    window.postMessage({ type: 'qczd-dump' }, '*');
    return new Promise((resolve) => setTimeout(() => resolve(xhrCache), 400));
  }

  function toISO(y, mo, d, h, mi) {
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00+08:00`;
  }

  function parseText(raw) {
    const t = String(raw).replace(/\s+/g, ' ').trim();
    if (!/积分/.test(t)) return null;
    const m = t.match(/(\d+(?:\.\d+)?)\s*积分\s*(.+?)\s*(报名中|已结束|进行中|即将开始|已满)/);
    if (!m) return null;
    const credits = Number(m[1]);
    const title = m[2].replace(/^[·\s]+/, '').slice(0, 60);
    if (title.length < 4) return null;
    const block = (t.match(/劳育|美育|创新|德育|体育/) || [])[0] || '其他';

    const dm = t.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\s*(\d{1,2}):(\d{2})\s*[—\-~至]+\s*(\d{4})\.(\d{1,2})\.(\d{1,2})\s*(\d{1,2}):(\d{2})/);
    const start_at = dm ? toISO(dm[1], dm[2], dm[3], dm[4], dm[5]) : '';
    const end_at = dm ? toISO(dm[6], dm[7], dm[8], dm[9], dm[10]) : '';

    const orgM = t.match(/(\d{1,2}:\d{2})\s+([^\s]{2,30})\s+(?:\d+\s*人报名|可报名|已报名|报名)/);
    const org = orgM ? orgM[2] : '';

    return {
      title,
      block,
      credits,
      start_at,
      end_at,
      deadline: end_at,
      location: (t.match(/地点[:：]?\s*([^\s｜|]{2,20})/) || [])[1] || '',
      org,
      source: '第二课堂 · 自动抓取'
    };
  }

  function collect() {
    const items = [];
    const texts = [];
    const seen = new Set();
    const nodes = document.querySelectorAll('div,li,article,section,a');
    for (const el of nodes) {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (t.length < 12 || t.length > 400) continue;
      if (!/学分|活动|报名/.test(t)) continue;
      if (el.querySelectorAll('*').length > 40) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      if (texts.length < 15) texts.push(t.slice(0, 240));
      const p = parseText(t);
      if (p) {
        const a = el.closest('a') || el.querySelector('a[href*="ctivity"],a[href*="acticvity"]');
        if (a && a.href) p.url = a.href;
        items.push(p);
      }
      if (items.length >= 60) break;
    }
    return { items, texts };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'qczd-scan') return;
    (async () => {
      const dom = collect();
      const xhr = await askXhr();
      sendResponse({ ok: true, items: dom.items, samples: dom.texts, xhr, url: location.href });
    })();
    return true;
  });
})();
