/* 在校园门户页面里运行：抓取通知标题、日期、部门，交给后台发到本机知了。 */
(() => {
  if (window.__zhiliaoInjected) return;
  window.__zhiliaoInjected = true;
  const NOISE = /首页|登录|退出|更多|上一页|下一页|尾页|版权所有|技术支持|返回|搜索|全部|展开|收起/;
  const KW = /关于|通知|公告|公示|报名|申报|评选|讲座|招聘|活动|安排/;
  const DEPT = /(教务处|学生工作部|学生处|学工部|团委|就业指导中心|就业|研究生院|图书馆|后勤|保卫处|档案馆|宣传部|国际处|财务处|实验室|信息网络|学院)/;
  const sent = new Set();
  let timer = null;
  let tick = null;
  let dead = false;

  const pad = (n) => String(n).padStart(2, '0');
  function dateOf(s) {
    const full = String(s).match(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/);
    if (full) return full[0].replace(/[年月]/g, '-').replace('日', '').replace(/\./g, '-');
    const short = String(s).match(/^(\d{1,2})[-/.](\d{1,2})$/);
    if (short) return `${new Date().getFullYear()}-${pad(short[1])}-${pad(short[2])}`;
    return '';
  }

  function collect() {
    const out = [];
    const seen = new Set();
    const push = (title, url, ctx) => {
      title = String(title || '').replace(/\s+/g, ' ').trim();
      if (title.length < 8 || title.length > 140) return;
      if (NOISE.test(title) || !KW.test(title)) return;
      if (seen.has(title)) return;
      seen.add(title);
      let date = dateOf(title);
      let dept = (title.match(DEPT) || [])[0] || '';
      const ctxText = String(ctx || '');
      if (!date) date = dateOf(ctxText);
      if (!dept) dept = (ctxText.match(DEPT) || [])[0] || '';
      out.push({ title, date, department: dept || '校园门户', url: url || '' });
    };

    document.querySelectorAll('a').forEach((a) => {
      const box = a.closest('li,tr,div') || a;
      push(a.innerText, a.href, box.innerText);
    });
    document.querySelectorAll('li,tr,div').forEach((el) => {
      const t = (el.innerText || '').trim();
      if (!t || t.length > 400) return;
      const first = t.split('\n')[0];
      if (!/^【?关于|^通知|^公告|^公示/.test(first)) return;
      push(first, '', t);
    });
    return out;
  }

  function scan(manual) {
    if (dead) return;
    if (!chrome.runtime || !chrome.runtime.id) { dead = true; clearInterval(tick); return; }
    const probe = location.href + document.title;
    if (!/lwPsTzggApp|tzgg|通知公告/i.test(probe) && !manual) return;
    const all = collect();
    const items = all.filter((x) => !sent.has(x.title));
    if (!items.length && !manual) return;   // 自动扫描没新内容就不打扰
    items.forEach((x) => sent.add(x.title));
    try {
      chrome.runtime.sendMessage({ type: 'sync', items, manual: !!manual, page: location.href }, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          if (/invalidated/i.test(err.message || '')) { dead = true; clearInterval(tick); }
          return;
        }
        if (res && (res.added || res.error)) console.log('[知了] 同步结果', res);
      });
    } catch (e) {
      dead = true;
      if (tick) clearInterval(tick);
    }
  }

  function debouncedScan() {
    clearTimeout(timer);
    timer = setTimeout(() => scan(false), 1500);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'scan') scan(true);
  });

  setTimeout(() => scan(false), 400);
  tick = setInterval(() => scan(false), 15000);
  new MutationObserver(debouncedScan).observe(document.documentElement, { childList: true, subtree: true });
})();
