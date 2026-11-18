/* 在青春长大（2kt.9xueqi.com）页面里抓活动卡片 → 交给后台写入知了 */
(() => {
  if (window.__qczdInjected) return;
  window.__qczdInjected = true;

  const BLOCKS = ['思想成长', '志愿公益', '创新创业', '文体活动', '技能特长', '实践实习', '其他'];

  function parseText(raw) {
    const t = String(raw).replace(/\s+/g, ' ').trim();
    if (!/学分/.test(t)) return null;
    const credits = (t.match(/(\d+(?:\.\d+)?)\s*学分/) || [])[1];
    if (!credits) return null;
    let title = t.split(/[｜|]/)[0];
    title = title.split(new RegExp(BLOCKS.join('|')))[0];
    title = title.replace(/\d+(?:\.\d+)?\s*学分.*$/, '').replace(/\d{1,2}\s*月.*$/, '').trim().slice(0, 60);
    if (title.length < 4) return null;
    const block = BLOCKS.find((b) => t.includes(b)) || '';
    const dm = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(\d{1,2})[:：](\d{2})/);
    const start = dm
      ? `${new Date().getFullYear()}-${String(dm[1]).padStart(2, '0')}-${String(dm[2]).padStart(2, '0')}T${String(dm[3]).padStart(2, '0')}:${dm[4]}:00+08:00`
      : '';
    const loc = (t.match(/地点[:：]?\s*([^\s｜|]{2,20})/) || [])[1] || '';
    const org = (t.match(/主办[:：]?\s*([^\s｜|]{2,20})/) || [])[1] || '';
    return { title, block, credits: Number(credits), start_at: start, location: loc, org, source: '第二课堂 · 自动抓取' };
  }

  function collect() {
    const items = [];
    const texts = [];
    const seen = new Set();
    const nodes = document.querySelectorAll('div,li,article,section,a');
    for (const el of nodes) {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (t.length < 12 || t.length > 400) continue;
      if (!/学分/.test(t)) continue;
      if (el.querySelectorAll('*').length > 40) continue;   // 跳过包含大量子节点的容器
      if (seen.has(t)) continue;
      seen.add(t);
      if (texts.length < 12) texts.push(t.slice(0, 200));
      const p = parseText(t);
      if (p) items.push(p);
      if (items.length >= 60) break;
    }
    return { items, texts };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'qczd-scan') return;
    const r = collect();
    sendResponse({ ok: true, items: r.items, samples: r.texts, url: location.href });
    return true;
  });
})();
