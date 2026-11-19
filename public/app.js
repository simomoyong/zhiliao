const state = {
  view: 'home',
  cat: '全部',
  q: '',
  items: [],
  prefs: { categories: [], quiet: '23:00-07:30', limit: 3 },
  unread: 0,
  health: { ai: false, items: 0 },
  sources: null,
  srcGroup: '全部',
  srcQ: '',
  portal: { lastSync: '', total: 0, url: '' },
  acts: [],
  actBlock: '全部',
  profile: {},
  feed: localStorage.getItem('zl_feed') || 'subs'
};

const IS_LOCAL = ['127.0.0.1', 'localhost'].includes(location.hostname);
const CATS = ['全部', '竞赛', '奖助', '教务', '就业', '讲座', '生活', '会议', '行政'];
const $ = (s) => document.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
  return res.json();
}

function fmtDeadline(iso) {
  if (!iso) return { text: '', cls: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { text: '', cls: '' };
  const now = new Date();
  const diff = d - now;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (diff < 0) return { text: '已截止', cls: 'over' };
  const hours = diff / 36e5;
  if (hours <= 24 && d.getDate() === now.getDate()) return { text: `今天 ${hh}:${mm}`, cls: 'soon' };
  if (hours <= 48) return { text: `明天 ${hh}:${mm}`, cls: 'soon' };
  if (hours <= 72) return { text: `${Math.ceil(hours / 24)} 天后截止`, cls: 'soon' };
  return { text: `${d.getMonth() + 1} 月 ${d.getDate()} 日截止`, cls: '' };
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

async function load() {
  const data = await api(`/api/items?category=${encodeURIComponent(state.cat)}&q=${encodeURIComponent(state.q)}`);
  state.items = data.items;
  state.unread = data.unread;
  state.prefs = data.prefs;
  try { state.health = await api('/api/health'); } catch {}
  try { state.portal = await api('/api/portal-status'); } catch {}
  try { state.acts = (await api('/api/activities')).items || []; } catch {}
  try { state.profile = await api('/api/profile'); } catch {}
  render();
}

function renderUnread() {
  const b = $('#unreadBtn');
  b.textContent = state.unread > 0 ? `${state.unread} 条未读` : '全部已读';
  b.classList.toggle('strong', state.unread > 0);
}

function renderChips() {
  $('#cats').innerHTML = CATS.map((c) =>
    `<button class="chip ${state.cat === c ? 'on' : ''}" data-cat="${c}">${c}</button>`
  ).join('');
}

function renderHome() {
  const subs = new Set(state.prefs.categories || []);
  const list = state.feed === 'subs' ? state.items.filter((i) => subs.has(i.category)) : state.items;
  const subCount = state.items.filter((i) => subs.has(i.category)).length;
  const switcher = `<div class="feed-switch">
    <button class="fs ${state.feed === 'subs' ? 'on' : ''}" data-feed="subs">订阅 <b>${subCount}</b></button>
    <button class="fs ${state.feed === 'all' ? 'on' : ''}" data-feed="all">全部 <b>${state.items.length}</b></button>
  </div>`;
  if (!list.length) {
    $('#main').innerHTML = `${switcher}<div class="empty">${state.feed === 'subs' ? '订阅里还没有内容<br /><button class="btn ghost" id="goSubs" style="margin-top:14px;width:auto;padding:10px 18px">去订阅页勾选类别</button>' : '没有符合条件的通知'}</div>`;
    const go = $('#goSubs');
    if (go) go.addEventListener('click', () => { state.view = 'subs'; render(); });
    return;
  }
  const now = Date.now();
  const isExp = (it) => it.deadline && new Date(it.deadline).getTime() < now;
  const ordered = [...list.filter((i) => !isExp(i)), ...list.filter((it) => isExp(it))];
  const cards = ordered.map((it) => {
    const dl = fmtDeadline(it.deadline);
    const exp = isExp(it);
    return `<article class="card ${it.is_read ? 'read' : ''} ${exp ? 'expired' : ''}" data-id="${it.id}">
      <div class="card-head">
        <span class="cat cat-${it.category}">${esc(it.category)}</span>
        <span class="src">${esc(it.source)}</span>
      </div>
      <h3 class="title">${esc(it.title)}</h3>
      <p class="summary">${esc(it.summary || '')}</p>
      <div class="card-foot">
        ${it.is_read ? '' : '<span class="dot"></span>'}
        ${exp ? '<span class="deadline over">已截止</span>' : (dl.text ? `<span class="deadline ${dl.cls}">${esc(dl.text)}</span>` : '<span>未标注截止</span>')}
        <span style="margin-left:auto">${it.source_type === '公众号' ? '公众号' : '官网'}</span>
      </div>
    </article>`;
  }).join('');
  const real = list.filter((i) => !String(i.ext_id || '').startsWith('seed-')).length;
  const seed = list.length - real;
  $('#main').innerHTML = `
    ${switcher}
    <div class="notice-tip"><b>${real ? '真实抓取' : '示例数据'}</b> · 共 ${list.length} 条${real && seed ? `（真实 ${real} / 示例 ${seed}）` : ''}，进行中优先、已截止置底</div>
    ${syncBar()}
    ${cards}`;
}

function renderSubs() {
  const on = new Set(state.prefs.categories || []);
  const cats = CATS.filter((c) => c !== '全部');
  $('#main').innerHTML = `
    <div class="section-title">按类别订阅</div>
    <div class="panel">
      ${cats.map((c) => `<div class="row">
        <div class="txt"><b>${c}</b><span>${descOf(c)}</span></div>
        <div class="switch ${on.has(c) ? 'on' : ''}" data-sub="${c}"></div>
      </div>`).join('')}
    </div>
    <div class="section-title">提醒节奏</div>
    <div class="panel">
      <div class="row"><div class="txt"><b>免打扰</b><span>${esc(state.prefs.quiet)} 不推送，顺延到早上</span></div><div class="switch on"></div></div>
      <div class="row"><div class="txt"><b>每日上限</b><span>当前 ${state.prefs.limit} 条，超出合并成一条</span></div></div>
    </div>
    <p class="note">关闭的类别不会出现在「通知」里，但仍可搜索到。提醒通道：应用内 + 日历订阅 + 邮件摘要。</p>
  `;
  $('#main').querySelectorAll('[data-sub]').forEach((el) => {
    el.addEventListener('click', async () => {
      const c = el.dataset.sub;
      const next = new Set(state.prefs.categories || []);
      next.has(c) ? next.delete(c) : next.add(c);
      state.prefs = await api('/api/prefs', { method: 'PUT', body: JSON.stringify({ categories: [...next] }) });
      render();
    });
  });
}

function descOf(c) {
  return {
    竞赛: '挑战杯、学科竞赛、大创',
    奖助: '奖学金、助学金、评优',
    教务: '考试、选课、学籍',
    就业: '宣讲会、招聘、实习',
    讲座: '学术讲座、沙龙、培训',
    生活: '停水停电、文体活动',
    会议: '例会、座谈、验收会',
    行政: '公示、聘任、值班'
  }[c] || '';
}

function b64ToU8(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSub() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  return await reg.pushManager.getSubscription();
}

async function refreshPushStatus() {
  const el = document.getElementById('pushStatus');
  if (!el) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    el.textContent = '当前浏览器不支持 Web Push';
    return;
  }
  try {
    const sub = await Promise.race([
      currentSub(),
      new Promise((r) => setTimeout(() => r(null), 2000))
    ]);
    el.textContent = sub ? '已开启，新通知会弹系统通知' : '未开启（点右侧开启并允许通知）';
    const btn = document.getElementById('pushBtn');
    if (btn) btn.textContent = sub ? '已开启' : '开启';
  } catch (e) {
    el.textContent = '检查失败：' + e.message;
  }
}

async function enablePush() {
  const el = document.getElementById('pushStatus');
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      el.textContent = '这个浏览器不支持 Web Push，换 Chrome 试试';
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { el.textContent = '你拒绝了通知权限，可在浏览器设置里重新允许'; return; }
    const reg = await navigator.serviceWorker.ready;
    const { key } = await api('/api/push/public-key');
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
    el.textContent = '已开启，点「测试」发一条看看';
    const btn = document.getElementById('pushBtn');
    if (btn) btn.textContent = '已开启';
  } catch (e) {
    el.textContent = '开启失败：' + e.message;
  }
}

async function testPush() {
  const el = document.getElementById('pushStatus');
  el.textContent = '正在发送测试通知…';
  try {
    const r = await api('/api/push/test', { method: 'POST' });
    el.textContent = `已发送 ${r.sent} 条（成功 ${(r.results || []).filter((x) => x.ok).length}）`;
  } catch (e) {
    el.textContent = '发送失败：' + e.message;
  }
}

function renderMe() {
  const ai = state.health.ai;
  $('#main').innerHTML = `
    <div class="section-title">账号</div>
    <div class="panel">
      <div class="stat">
        <div><div class="num">${state.health.items || 0}</div><div class="lbl">已收录通知</div></div>
        <div style="width:1px;height:32px;background:var(--line);margin:0 8px"></div>
        <div><div class="num">${state.unread}</div><div class="lbl">未读</div></div>
      </div>
    </div>

    <div class="section-title">AI 服务</div>
    <div class="panel">
      <div class="row">
        <div class="txt"><b>${ai ? '已连接 DeepSeek' : '未配置 API Key'}</b>
        <span>${ai ? '分类、摘要、截止时间由大模型抽取' : '当前为规则模式：关键词分类 + 截断摘要'}</span></div>
        <span class="cat ${ai ? 'cat-就业' : 'cat-奖助'}">${ai ? '正常' : '降级'}</span>
      </div>
      <div class="row"><div class="txt"><b>怎么开启</b><span>在项目根目录 .env 里填 DEEPSEEK_API_KEY，重启服务即可</span></div></div>
    </div>

    <div class="section-title">提醒</div>
    <div class="panel">
      <div class="row" id="icsRow"><div class="txt"><b>导出日历</b><span>把截止时间写进手机日历，系统原生提醒</span></div><span style="color:var(--faint)">›</span></div>
      <div class="row"><div class="txt"><b>锁屏通知</b><span id="pushStatus">检查中…</span></div>
        <button class="btn primary" id="pushBtn" style="width:auto;padding:8px 14px;font-size:12px">开启</button></div>
      <div class="row"><div class="txt"><b>发送测试通知</b><span>验证系统通知能不能弹出来</span></div>
        <button class="btn ghost" id="pushTest" style="width:auto;padding:8px 14px;font-size:12px">测试</button></div>
    </div>

    <div class="section-title">公众号文章</div>
    <div class="panel">
      <div class="row" id="importRow"><div class="txt"><b>粘贴文章链接导入</b><span>只解析你主动提交的单篇，不批量抓取</span></div><span style="color:var(--faint)">›</span></div>
    </div>

    <div class="section-title">关于</div>
    <div class="panel">
      <div class="row"><div class="txt"><b>数据来源</b><span>学校官网公开页面 + 用户主动导入</span></div></div>
      <div class="row"><div class="txt"><b>隐私</b><span>不采集成绩、课表与个人身份信息</span></div></div>
      <div class="row"><div class="txt"><b>版本</b><span>知了 v0.4 · 课程原型</span></div></div>
    </div>
    <p class="note">本页为《人工智能导论》期末作业原型，数据为示例，实际界面以部署版本为准。</p>
  `;
  $('#icsRow').addEventListener('click', () => { window.location.href = '/api/ics'; });
  const pushBtn = $('#pushBtn');
  if (pushBtn) {
    pushBtn.addEventListener('click', enablePush);
    $('#pushTest').addEventListener('click', testPush);
    refreshPushStatus();
  }
  $('#importRow').addEventListener('click', importFlow);
}

async function importFlow() {
  const url = prompt('粘贴公众号文章链接（mp.weixin.qq.com/s/...）');
  if (!url) return;
  const tip = document.createElement('div');
  tip.className = 'empty';
  tip.textContent = '正在抓取并解析…';
  $('#main').prepend(tip);
  try {
    const r = await api('/api/import', { method: 'POST', body: JSON.stringify({ url }) });
    tip.textContent = `导入成功，分类：${r.category}（${r.mode === 'ai' ? 'AI' : '规则'}模式）`;
    setTimeout(() => load(), 600);
  } catch (e) {
    tip.textContent = '导入失败：' + e.message;
  }
}

async function openDetail(id) {
  const it = await api(`/api/items/${id}`);
  const dl = fmtDeadline(it.deadline);
  $('#sheetPanel').innerHTML = `
    <div class="sheet-bar"></div>
    <div class="card-head">
      <span class="cat cat-${it.category}">${esc(it.category)}</span>
      <span class="src">${esc(it.source)} · ${fmtDate(it.published_at)}</span>
    </div>
    <h2 class="d-title">${esc(it.title)}</h2>
    <div class="ai-card">
      <div class="h">AI 摘要 · ${it.source_type === '公众号' ? '公众号' : '官网'}</div>
      <p>${esc(it.summary || '暂无摘要')}</p>
    </div>
    <div class="panel" style="padding:0 14px">
      ${it.deadline ? `<div class="kv"><div class="k">截止时间</div><div class="v">${esc(new Date(it.deadline).toLocaleString('zh-CN', { hour12: false }))} ${dl.cls === 'soon' ? '（临近）' : ''}</div></div>` : ''}
      ${it.audience ? `<div class="kv"><div class="k">适用人群</div><div class="v">${esc(it.audience)}</div></div>` : ''}
      ${it.signup_url ? `<div class="kv"><div class="k">报名入口</div><div class="v"><a href="${esc(it.signup_url)}" target="_blank" rel="noreferrer">${esc(it.signup_url)}</a></div></div>` : ''}
      <div class="kv"><div class="k">来源</div><div class="v">${esc(it.source)}${it.url ? ` · <a href="${esc(it.url)}" target="_blank" rel="noreferrer">原文</a>` : ''}</div></div>
    </div>
    <div class="d-actions">
      <button class="btn ghost" id="saveBtn">${it.is_saved ? '已收藏' : '收藏'}</button>
      <button class="btn primary" id="icsBtn">加入日历</button>
    </div>
    <p class="note">摘要由模型生成，可能有误；请以原文为准。</p>
  `;
  $('#sheet').classList.add('open');
  $('#sheet').setAttribute('aria-hidden', 'false');
  $('#saveBtn').addEventListener('click', async () => {
    const r = await api(`/api/items/${id}/save`, { method: 'POST' });
    $('#saveBtn').textContent = r.saved ? '已收藏' : '收藏';
  });
  $('#icsBtn').addEventListener('click', () => { window.location.href = '/api/ics'; });
  await api(`/api/items/${id}/read`, { method: 'POST' });
  state.unread = Math.max(0, state.unread - (it.is_read ? 0 : 1));
  renderUnread();
  state.items = state.items.map((x) => (x.id === it.id ? { ...x, is_read: 1 } : x));
  if (state.view === 'home') renderHome();
}

/* ============ 公众号信源 ============ */
function cardSource(s) {
  return `<article class="src-item" data-src="${s.id}">
    <div class="info">
      <div class="nm">${esc(s.name)}</div>
      <div class="meta">
        <span>${esc(s.type)}</span><span>·</span><span>${esc(s.group)}</span>
        <span class="tag ${s.status === '已核实' ? 'ok' : 'todo'}">${esc(s.status)}</span>
        ${s.alias ? `<span>别名 ${esc(s.alias)}</span>` : ''}
      </div>
      ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
    </div>
    ${s.qr ? `<img class="qr-thumb" src="${esc(s.qr)}" alt="${esc(s.name)} 二维码" loading="lazy" />`
           : `<div class="qr-none">待补<br />二维码</div>`}
  </article>`;
}

async function loadSources() {
  if (!state.sources) {
    try { state.sources = (await api('/api/sources')).sources; }
    catch { state.sources = []; }
  }
  render();
}

function recommendSources() {
  if (!state.sources) return [];
  const college = state.prefs.college || '';
  const recs = [];
  const add = (s) => { if (s && !recs.find((x) => x.id === s.id)) recs.push(s); };
  if (college) state.sources.filter((s) => s.org.includes(college)).forEach(add);
  ['长安大学', '长安大学团委', '长安大学就业', '长安大学图书馆'].forEach((n) =>
    add(state.sources.find((s) => s.name === n))
  );
  return recs.slice(0, 6);
}

function maybeOnboard() {
  if (localStorage.getItem('zl_onboard')) return;
  if (document.getElementById('onboard')) return;
  const colleges = [...new Set((state.sources || []).filter((s) => s.group === '学院').map((s) => s.org))].sort();
  const cats = ['竞赛', '奖助', '教务', '就业', '讲座', '生活', '会议', '行政'];
  const chosen = new Set(['竞赛', '奖助', '教务', '就业']);
  const el = document.createElement('div');
  el.id = 'onboard';
  el.className = 'onboard';
  el.innerHTML = `
    <div class="ob-card">
      <div class="ob-kicker">第一次来，先认识一下</div>
      <h2>帮你挑几个该关注的号</h2>
      <p class="ob-sub">选学院和你想看的类别，之后在「订阅」里就能只看到这些。</p>
      <label class="ob-label">你所在的学院</label>
      <select id="obCollege">
        <option value="">不限 / 先跳过</option>
        ${colleges.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select>
      <label class="ob-label">想关注哪些类别</label>
      <div class="ob-chips">
        ${cats.map((c) => `<button class="ob-chip ${chosen.has(c) ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('')}
      </div>
      <button class="btn primary" id="obDone">完成，看看推荐</button>
      <button class="ob-skip" id="obSkip">先随便看看</button>
    </div>`;
  document.body.appendChild(el);
  el.querySelectorAll('.ob-chip').forEach((b) => b.addEventListener('click', () => b.classList.toggle('on')));
  const save = async (skip) => {
    const college = skip ? '' : ($('#obCollege').value || '');
    const categories = skip ? ['竞赛', '奖助', '教务', '就业', '讲座', '生活', '会议', '行政'] : [...el.querySelectorAll('.ob-chip.on')].map((b) => b.dataset.cat);
    try {
      state.prefs = await api('/api/prefs', { method: 'PUT', body: JSON.stringify({ college, categories }) });
    } catch (e) {}
    localStorage.setItem('zl_onboard', '1');
    el.remove();
    renderSources();
  };
  $('#obDone').addEventListener('click', () => save(false));
  $('#obSkip').addEventListener('click', () => save(true));
}

function renderSources() {
  if (!state.sources) {
    $('#main').innerHTML = '<div class="empty">正在加载信源…</div>';
    return;
  }
  const all = state.sources;
  const q = state.srcQ.trim();
  const list = all.filter((s) =>
    (state.srcGroup === '全部' || s.group === state.srcGroup) &&
    (!q || `${s.name}${s.alias}${s.org}`.includes(q))
  );
  const withQr = all.filter((s) => s.qr).length;
  const groups = ['全部', '校级', '学院', '学生组织', '媒体'];
  const recs = recommendSources();
  const college = state.prefs.college || '';
  const recBlock = recs.length ? `
    <div class="rec-head"><span>为你推荐</span>${college ? `<button id="reOnboard">换学院</button>` : ''}</div>
    ${college ? `<div class="rec-why">你在${esc(college)}，已优先挑出学院号和几个必关注的校级号</div>` : ''}
    ${recs.map(cardSource).join('')}
  ` : '';
  $('#main').innerHTML = `
    <div class="src-hero"><span class="big">${all.length}</span><span class="lbl">个信源 · ${withQr} 个已配二维码</span></div>
    ${recBlock}

    <div class="import-card">
      <div class="t">导入一篇公众号文章</div>
      <div class="import-row">
        <input id="impUrl" placeholder="粘贴 mp.weixin.qq.com 链接" />
        <button id="impBtn">导入</button>
      </div>
      <div class="import-status" id="impStatus"></div>
      <div class="import-hint">只解析你主动提交的单篇，不批量抓取；导入后进入「通知」。</div>
    </div>

    <div class="import-card">
      <div class="t">从门户复制文字导入</div>
      <textarea id="pasteText" rows="3" placeholder="在门户通知页按 ⌘A 全选、⌘C 复制，然后粘贴到这里"></textarea>
      <div class="import-row" style="margin-top:8px">
        <button id="pasteBtn" style="width:100%">识别并导入</button>
      </div>
      <div class="import-status" id="pasteStatus"></div>
      <div class="import-hint">适合需要登录的门户通知页。会自动挑出含「关于 / 通知 / 公示 / 报名」的标题，并识别日期与部门。</div>
    </div>

    <div class="seg">
      ${groups.map((g) => `<button class="chip ${state.srcGroup === g ? 'on' : ''}" data-g="${g}">${g}</button>`).join('')}
    </div>

    <div class="src-search">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="srcQ" placeholder="搜信源名称、归属单位" value="${esc(state.srcQ)}" />
    </div>

    ${list.length ? list.map(cardSource).join('') : '<div class="empty">没有匹配的信源</div>'}
  `;
  const re = $('#reOnboard');
  if (re) re.addEventListener('click', () => { localStorage.removeItem('zl_onboard'); renderSources(); });
  maybeOnboard();
  $('#impBtn').addEventListener('click', importFromSources);
  $('#impUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') importFromSources(); });
  $('#pasteBtn').addEventListener('click', importFromText);
  const box = $('#srcQ');
  box.addEventListener('input', () => {
    state.srcQ = box.value;
    clearTimeout(state._srcTimer);
    state._srcTimer = setTimeout(() => {
      renderSources();
      const b = $('#srcQ');
      if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    }, 220);
  });
}

function parseNoticeText(text) {
  const NOISE = /首页|登录|退出|更多|上一页|下一页|尾页|版权所有|技术支持|返回|搜索|全部|展开|收起/;
  const KW = /关于|通知|公告|公示|报名|申报|评选|讲座|招聘|活动|安排/;
  const DEPT = /(教务处|学生工作部|学生处|学工部|团委|就业指导中心|就业|研究生院|图书馆|后勤|保卫处|档案馆|宣传部|国际处|财务处|实验室|信息网络|学院)/;
  const lines = String(text).split(/\r?\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const pad = (n) => String(n).padStart(2, '0');
  const dateOf = (s) => {
    const full = s.match(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/);
    if (full) return full[0].replace(/[年月]/g, '-').replace('日', '').replace(/\./g, '-');
    const short = s.match(/^(\d{1,2})[-/.](\d{1,2})$/);
    if (short) return `${new Date().getFullYear()}-${pad(short[1])}-${pad(short[2])}`;
    return '';
  };
  const items = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 8 || line.length > 140) continue;
    if (NOISE.test(line) || !KW.test(line)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    let date = dateOf(line);
    let dept = (line.match(DEPT) || [])[0] || '';
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      if (!date) date = dateOf(lines[j]);
      if (!dept) dept = (lines[j].match(DEPT) || [])[0] || '';
    }
    items.push({ title: line, date, department: dept || '校园门户', url: '' });
  }
  return items;
}

async function importFromText() {
  const ta = $('#pasteText');
  const status = $('#pasteStatus');
  const text = (ta.value || '').trim();
  if (!text) { status.textContent = '先把门户页面的文字粘进来'; return; }
  const items = parseNoticeText(text);
  if (!items.length) {
    status.textContent = '没识别出通知。请确认复制的是列表区域，且标题里含「关于 / 通知 / 公示」。';
    return;
  }
  status.textContent = `识别到 ${items.length} 条，正在导入…`;
  try {
    const r = await api('/api/import/batch', { method: 'POST', body: JSON.stringify({ items }) });
    status.textContent = `导入完成：新增 ${r.added} 条，跳过 ${r.skipped} 条。去「通知」页看看。`;
    ta.value = '';
    setTimeout(() => load(), 600);
  } catch (e) {
    status.textContent = '导入失败：' + e.message;
  }
}

async function importFromSources() {
  const input = $('#impUrl');
  const status = $('#impStatus');
  const url = (input.value || '').trim();
  if (!url) { status.textContent = '先粘贴一个文章链接'; return; }
  status.textContent = '正在抓取并解析…';
  try {
    const r = await api('/api/import', { method: 'POST', body: JSON.stringify({ url }) });
    status.innerHTML = `导入成功 · 分类「${esc(r.category)}」· ${r.mode === 'ai' ? 'AI 模式' : '规则模式'}，<span id="goHome" style="color:var(--navy-2);text-decoration:underline;cursor:pointer">去通知页看</span>`;
    $('#goHome').addEventListener('click', () => { state.view = 'home'; input.value = ''; load(); });
  } catch (e) {
    status.textContent = '导入失败：' + e.message;
  }
}

function openSource(id) {
  const s = (state.sources || []).find((x) => x.id === Number(id));
  if (!s) return;
  $('#sheetPanel').innerHTML = `
    <div class="sheet-bar"></div>
    <h2 class="d-title" style="margin-top:2px">${esc(s.name)}</h2>
    <div class="d-meta">
      <span class="tag ${s.status === '已核实' ? 'ok' : 'todo'}">${esc(s.status)}</span>
      <span>${esc(s.type)}</span><span>·</span><span>${esc(s.group)}</span><span>·</span><span>${esc(s.org)}</span>
    </div>
    ${s.qr ? `<img class="big-qr" src="${esc(s.qr)}" alt="${esc(s.name)} 二维码" />`
           : '<div class="empty" style="padding:30px 0">这个号还没有二维码，需要扫码后补录</div>'}
    <div class="panel" style="padding:0 14px">
      ${s.alias ? `<div class="kv"><div class="k">别名</div><div class="v">${esc(s.alias)}</div></div>` : ''}
      <div class="kv"><div class="k">归属</div><div class="v">${esc(s.org)}</div></div>
      <div class="kv"><div class="k">来源</div><div class="v">${esc(s.from)}</div></div>
      ${s.note ? `<div class="kv"><div class="k">备注</div><div class="v">${esc(s.note)}</div></div>` : ''}
    </div>
    <p class="note">长按二维码可保存图片；在微信「搜一搜」里搜账号名也能找到。</p>
  `;
  $('#sheet').classList.add('open');
  $('#sheet').setAttribute('aria-hidden', 'false');
}

function portalStatus() {
  const p = state.portal || {};
  if (!p.lastSync) return { text: '还没有同步过', live: false };
  const mins = Math.floor((Date.now() - new Date(p.lastSync).getTime()) / 60000);
  const t = mins < 1 ? '刚刚' : mins < 60 ? `${mins} 分钟前` : `${Math.floor(mins / 60)} 小时前`;
  return { text: `最近同步 ${t} · 累计 ${p.total} 条`, live: mins < 120 };
}

function syncBar() {
  if (!IS_LOCAL) {
    return `<div class="sync-bar">
      <span class="live off"></span>
      <span>线上演示版 · 门户同步仅本机可用</span>
      <button id="goPortal">说明 ›</button>
    </div>`;
  }
  const st = portalStatus();
  return `<div class="sync-bar">
    <span class="live ${st.live ? '' : 'off'}"></span>
    <span id="syncText">门户同步：${esc(st.text)}</span>
    <button id="syncNowBtn">一键同步</button>
    <button id="goPortal">设置 ›</button>
  </div>`;
}

const EXT_ID = 'jpclkialpgklohaijlgnclcjgjakfjii';
let portalPoll = null;

function setSyncText(msg) {
  ['syncText', 'syncText2'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
  });
}

let estimateTimer = null;
let estimateLeft = 0;

function stopEstimate() {
  clearInterval(estimateTimer);
  estimateTimer = null;
}

function startEstimate(seconds, prefix) {
  stopEstimate();
  estimateLeft = seconds;
  const paint = () => {
    const tail = estimateLeft > 0 ? `预计 ${estimateLeft} 秒` : '比预期久一点，还在等…';
    setSyncText(`请稍等，${prefix}… ${tail}`);
  };
  paint();
  estimateTimer = setInterval(() => {
    estimateLeft -= 1;
    paint();
    if (estimateLeft <= 0) stopEstimate();
  }, 1000);
}

function openLoginAndPoll() {
  stopEstimate();
  window.open('/login', '_blank');
  setSyncText('已打开登录页，登录后会自动同步');
  pollPortal(80);
}

let syncStartedAt = 0;
let syncMode = 'scan';

function estSeconds(mode, fallback) {
  try {
    const a = JSON.parse(localStorage.getItem('zl_est') || '{}');
    return a[mode] ? Math.max(2, Math.round(a[mode] / 1000)) : fallback;
  } catch (e) { return fallback; }
}

function recordDuration(mode, ms) {
  if (!ms || ms < 500) return;
  try {
    const a = JSON.parse(localStorage.getItem('zl_est') || '{}');
    a[mode] = ms < 5000 ? ms : Math.round((a[mode] || ms) * 0.6 + ms * 0.4);
    localStorage.setItem('zl_est', JSON.stringify(a));
  } catch (e) {}
}

async function triggerSync() {
  if (!IS_LOCAL) { window.open('/portal', '_blank'); return; }
  // 先取一次最新状态，避免把“历史记录”误判成“这次同步成功”
  try { state.portal = await api('/api/portal-status'); } catch (e) {}
  syncStartedAt = Date.now();
  syncMode = 'scan';
  startEstimate(estSeconds('scan', 6), '正在读取信息');
  pollPortal(60);
  let answered = false;
  try {
    if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(EXT_ID, { type: 'sync-now' }, (res) => {
        answered = true;
        if (chrome.runtime.lastError || !res) { openLoginAndPoll(); return; }
        if (res.mode === 'login' || res.mode === 'login-existing') {
          stopEstimate();
          setSyncText('需要登录，已切到登录页；登录后会自动同步并切回来');
          pollPortal(80);
        } else if (res.mode === 'scan' && res.injected === false) {
          stopEstimate();
          setSyncText('找到门户页了，但读不到内容；请在门户页按 F5 后重试');
        } else {
          syncMode = res.mode === 'scan-bg' ? 'scan-bg' : 'scan';
          startEstimate(estSeconds(syncMode, syncMode === 'scan-bg' ? 6 : 3), '正在读取信息');
        }
      });
      setTimeout(() => { if (!answered) { answered = true; openLoginAndPoll(); } }, 800);
      return;
    }
  } catch (e) {}
  openLoginAndPoll();
}

function pollPortal(times = 10) {
  clearInterval(portalPoll);
  const before = (state.portal || {}).lastSync || '';
  let n = 0;
  portalPoll = setInterval(async () => {
    n += 1;
    try {
      const p = await api('/api/portal-status');
      state.portal = p;
      if (p.lastSync && p.lastSync !== before) {
        clearInterval(portalPoll);
        stopEstimate();
        recordDuration(syncMode, Date.now() - syncStartedAt);
        setSyncText(p.added ? `同步完成，新增 ${p.added} 条` : '同步完成，没有新内容');
        setTimeout(() => load(), 500);
      } else if (n >= times) {
        clearInterval(portalPoll);
        stopEstimate();
        setSyncText(p.lastSync ? '已是最新' : '等你登录门户后会自动同步');
      }
    } catch (e) {
      if (n >= times) clearInterval(portalPoll);
    }
  }, 500);
}

function fmtRange(a) {
  if (!a.start_at) return '';
  const d = new Date(a.start_at);
  const t = `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (!a.end_at) return t;
  const e = new Date(a.end_at);
  return `${t}–${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
}

function actStats() {
  const p = state.profile || {};
  const mine = { 劳育: Number(p.labor) || 0, 美育: Number(p.aesthetic) || 0, 创新: Number(p.innovation) || 0 };
  const hasMine = mine.劳育 + mine.美育 + mine.创新 > 0;
  if (hasMine) return { mode: 'mine', values: mine };
  const out = { 劳育: 0, 美育: 0, 创新: 0 };
  for (const a of state.acts || []) {
    if (a.full || a.status === '已结束') continue;
    if (out[a.block] !== undefined) out[a.block] += Number(a.credits) || 0;
  }
  return { mode: 'open', values: out };
}

function renderActs() {
  const all = state.acts || [];
  const stats = actStats();
  const blocks = ['全部', '劳育', '美育', '创新'];
  const list = (state.actBlock === '全部' ? all : all.filter((a) => a.block === state.actBlock));
  const sorted = [...list].sort((a, b) => {
    const fa = a.full ? 1 : 0;
    const fb = b.full ? 1 : 0;
    if (fa !== fb) return fa - fb;
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const db2 = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    return da - db2;
  });

  if (!all.length) {
    $('#main').innerHTML = '<div class="empty">还没有第二课堂活动<br />登录青春长大后可同步</div>';
    return;
  }

  $('#main').innerHTML = `
    <div class="act-stats">
      ${['劳育', '美育', '创新'].map((b) => `<div class="as-item"><b>${stats.values[b].toFixed(1)}</b><span>${b} 积分</span></div>`).join('')}
    </div>
    <div class="act-tip">${stats.mode === 'mine' ? '我的积分（来自青春长大成绩页）' : '可拿积分（按未报满活动统计）· 点「同步我的积分」可切换'}</div>

    <div class="act-actions">
      <button class="act-import" id="syncQczd">一键同步</button>
      <button class="act-import" id="syncProfile">同步我的积分</button>
      <button class="act-import" id="importAct">＋ 导入</button>
    </div>
    <div class="act-status" id="actStatus2"></div>

    <div class="seg">
      ${blocks.map((b) => `<button class="chip ${state.actBlock === b ? 'on' : ''}" data-ab="${b}">${b}</button>`).join('')}
    </div>

    ${sorted.length ? sorted.map((a) => {
      const dl = fmtDeadline(a.deadline);
      return `<article class="card act ${a.full ? 'act-full' : ''}" data-act="${a.id}">
        <div class="card-head">
          <span class="cat cat-act">${esc(a.block || '未分类')}</span>
          ${a.full ? '<span class="badge-full">已满</span>' : `<span class="credits">+${Number(a.credits || 0).toFixed(1)} 积分</span>`}
        </div>
        <h3 class="title">${esc(a.title)}</h3>
        <p class="summary">${esc(a.org || '')}${a.location ? ' · ' + esc(a.location) : ''}<br />${esc(fmtRange(a))}</p>
        <div class="card-foot">
          ${a.full ? '<span class="deadline over">已报满</span>' : (dl.text ? `<span class="deadline ${dl.cls}">报名 ${esc(dl.text)}</span>` : '<span>常年可报</span>')}
        </div>
      </article>`;
    }).join('') : '<div class="empty">这个类别下还没有活动</div>'}
  `;
}

function triggerQczd() {
  const st = $('#actStatus2');
  if (!IS_LOCAL) { st.textContent = '线上演示版不支持抓取，请在本机使用'; return; }
  st.textContent = '正在读取青春长大页面（会自动滚到底加载全部）…';
  let answered = false;
  try {
    if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(EXT_ID, { type: 'qczd-now' }, (res) => {
        answered = true;
        if (chrome.runtime.lastError || !res) {
          st.textContent = '扩展连接失效：请刷新本页（⌘R）后重试；仍不行就到 chrome://extensions 看有没有报错';
          return;
        }
        if (res.mode === 'open') { st.textContent = '已打开青春长大，登录并进入活动页后，再点一次「一键同步」'; return; }
        if (res.mode === 'empty') { st.textContent = `页面里没识别到活动（记下 ${res.samples || 0} 段样本，我看看结构）`; return; }
        st.textContent = `同步完成：${res.count} 个活动`;
        setTimeout(() => load(), 600);
      });
      setTimeout(() => { if (!answered) st.textContent = '扩展没有响应：先刷新本页（⌘R）再试'; }, 6000);
      return;
    }
  } catch (e) {
    st.textContent = '扩展连接失效：请刷新本页（⌘R）后重试';
    return;
  }
  st.textContent = '这个功能需要 Chrome 扩展（本机版）';
}

function triggerProfile() {
  const st = $('#actStatus2');
  if (!IS_LOCAL) { st.textContent = '线上演示版不支持'; return; }
  st.textContent = '正在读取青春长大的积分…';
  let answered = false;
  try {
    chrome.runtime.sendMessage(EXT_ID, { type: 'qczd-profile' }, (res) => {
      answered = true;
      if (chrome.runtime.lastError || !res || !res.ok) {
        st.textContent = chrome.runtime.lastError
          ? '扩展连接失效：请刷新本页（⌘R）后重试'
          : '没读到。请先在青春长大「二课成绩」页停留，再回来点一次';
        return;
      }
      const p = res.profile || {};
      st.textContent = `已读取：劳育 ${p.labor || 0} / 美育 ${p.aesthetic || 0} / 创新 ${p.innovation || 0}`;
      state.profile = p;
      setTimeout(() => load(), 500);
    });
    setTimeout(() => { if (!answered) st.textContent = '扩展没有响应：先刷新本页（⌘R）再试'; }, 6000);
  } catch (e) {
    st.textContent = '扩展连接失效：请刷新本页（⌘R）后重试';
  }
}

function openActImport() {
  $('#sheetPanel').innerHTML = `
    <div class="sheet-bar"></div>
    <h2 class="d-title">导入第二课堂活动</h2>
    <p class="note" style="margin-top:0">在青春长大活动页选中活动卡片文字（或整页 ⌘A），粘贴到这里。能识别标题、板块（劳育/美育/创新）、积分、时间地点与截止。</p>
    <textarea id="actText" class="act-textarea" placeholder="示例：\n非遗剪纸体验工作坊\n板块：文体活动　学分：0.2\n11 月 26 日 15:00 艺术教育中心\n报名截止：11 月 25 日 17:00"></textarea>
    <div class="import-status" id="actStatus"></div>
    <div class="d-actions"><button class="btn primary" id="actDo">识别并导入</button></div>
  `;
  $('#sheet').classList.add('open');
  $('#sheet').setAttribute('aria-hidden', 'false');
  $('#actDo').addEventListener('click', doActImport);
}

const BLOCKS = ['劳育', '美育', '创新', '德育', '体育', '其他'];

function parseActs(text) {
  const lines = String(text).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    if (!/学分/.test(line) && !BLOCKS.some((b) => line.includes(b))) continue;
    let title = line.split(/[｜|]/)[0];
    title = title.split(new RegExp(BLOCKS.join('|')))[0];
    title = title.replace(/\d+(?:\.\d+)?\s*学分.*$/, '').replace(/\d{1,2}\s*月.*$/, '');
    title = title.replace(/\s+/g, ' ').trim().slice(0, 60);
    const credits = (line.match(/(\d+(?:\.\d+)?)\s*(?:积分|学分)/) || [])[1];
    if (!credits) continue;
    const block = BLOCKS.find((b) => line.includes(b)) || '';
    const dm = line.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2})[:：](\d{2})/);
    out.push({
      title: title || '未命名活动',
      block, credits: Number(credits),
      start_at: dm ? `2026-${String(dm[1]).padStart(2, '0')}-${String(dm[2]).padStart(2, '0')}T${String(dm[3]).padStart(2, '0')}:${dm[4]}:00+08:00` : '',
      location: (line.match(/地点[:：]?\s*([^｜|\s]{2,20})/) || [])[1] || '',
      deadline: '', org: '', source: '第二课堂 · 手动导入'
    });
  }
  return out;
}

async function doActImport() {
  const st = $('#actStatus');
  const items = parseActs($('#actText').value);
  if (!items.length) { st.textContent = '没识别到活动。每行需包含「积分」，例如：越剧折子戏 1 积分 美育'; return; }
  st.textContent = `识别到 ${items.length} 个活动，正在导入…`;
  try {
    const r = await api('/api/import/activities', { method: 'POST', body: JSON.stringify({ items }) });
    st.textContent = `导入完成：${r.upserted} 个`;
    setTimeout(() => { closeSheet(); load(); }, 700);
  } catch (e) { st.textContent = '导入失败：' + e.message; }
}

function openAct(id) {
  const a = (state.acts || []).find((x) => x.id === Number(id));
  if (!a) return;
  $('#sheetPanel').innerHTML = `
    <div class="sheet-bar"></div>
    <div class="card-head">
      <span class="cat cat-act">${esc(a.block || '未分类')}</span>
      <span class="credits">+${Number(a.credits || 0).toFixed(1)} 积分</span>
    </div>
    <h2 class="d-title">${esc(a.title)}</h2>
    <div class="panel" style="padding:0 14px">
      <div class="kv"><div class="k">活动时间</div><div class="v">${esc(fmtRange(a))}</div></div>
      ${a.location ? `<div class="kv"><div class="k">地点</div><div class="v">${esc(a.location)}</div></div>` : ''}
      <div class="kv"><div class="k">状态</div><div class="v">${a.full ? '已报满' : esc(a.status || '报名中')}${a.full ? '（仅作记录）' : ''}</div></div>
      <div class="kv"><div class="k">报名截止</div><div class="v">${a.deadline ? esc(new Date(a.deadline).toLocaleString('zh-CN', { hour12: false })) : '未标注'}</div></div>
      <div class="kv"><div class="k">主办</div><div class="v">${esc(a.org || '')}</div></div>
      <div class="kv"><div class="k">来源</div><div class="v">${esc(a.source || '第二课堂')}</div></div>
      <div class="kv"><div class="k">活动页</div><div class="v"><a href="${esc(a.url || 'https://win.9xueqi.com/#/AllActivity')}" target="_blank" rel="noreferrer">${a.url ? '在青春长大打开' : '去青春长大找这个活动'}</a></div></div>
    </div>
    <div class="d-actions"><button class="btn primary" id="actIcs">加入日历</button></div>
    <p class="note">积分与板块以青春长大平台为准；这里只做提醒。</p>
  `;
  $('#sheet').classList.add('open');
  $('#sheet').setAttribute('aria-hidden', 'false');
  $('#actIcs').addEventListener('click', () => { window.location.href = '/api/ics'; });
}

function renderPortal() {
  const st = portalStatus();
  const path = '/Users/smm/Desktop/Harness try/zhiliao/app/extension';
  $('#main').innerHTML = `
    <div class="hero-card">
      <h2>接通校园门户</h2>
      <p>${IS_LOCAL ? '点一下同步：门户开着就直接抓；没登录就直接打开登录页，登录完自动同步。' : '你现在看的是线上演示版。门户同步要在装了 Chrome 扩展的本机版里用，线上只展示已抓取的内容。'}</p>
      ${IS_LOCAL ? '<button class="btn" id="syncNowBtn2">一键同步</button>' : ''}
      <button class="btn" id="openPortal" style="margin-top:8px;background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.35)">只打开门户页</button>
    </div>

    <div class="panel">
      <div class="row">
        <div class="txt"><b>同步状态</b><span id="syncText2">${esc(st.text)}</span></div>
        <span class="cat ${st.live ? 'cat-就业' : 'cat-奖助'}">${st.live ? '正常' : '未接通'}</span>
      </div>
    </div>

    <div class="section-title">安装扩展（只需一次）</div>
    <div class="panel">
      <div class="step"><div class="n">1</div><div class="c"><b>打开扩展管理页</b>地址栏输入下面这行，回车<span class="mono">chrome://extensions</span></div></div>
      <div class="step"><div class="n">2</div><div class="c"><b>打开「开发者模式」</b>页面右上角有一个开关</div></div>
      <div class="step"><div class="n">3</div><div class="c"><b>加载已解压的扩展</b>点左上角按钮，选择这个文件夹
        <span class="mono">${esc(path)}</span>
        <button class="copy" data-copy="${esc(path)}">复制路径</button>
      </div></div>
      <div class="step"><div class="n">4</div><div class="c"><b>刷新门户页面</b>回到门户通知页按 F5，扩展会自动扫一次</div></div>
    </div>

    <div class="section-title">注意</div>
    <div class="panel">
      <div class="row"><div class="txt"><b>门户标签页要留着</b><span>可以切走或最小化，但不能关；它用你浏览器里的登录状态</span></div></div>
      <div class="row"><div class="txt"><b>知了服务要开着</b><span>关了就提示连不上 127.0.0.1:8787</span></div></div>
      <div class="row"><div class="txt"><b>只支持 Chrome / Edge</b><span>Safari 不支持这类扩展</span></div></div>
    </div>

    <div class="section-title">不想装扩展？</div>
    <div class="panel">
      <div class="row" id="gotoPaste"><div class="txt"><b>用复制粘贴导入</b><span>在门户页全选复制，到「公众号」页粘贴</span></div><span style="color:var(--faint)">›</span></div>
    </div>
    <p class="note">扩展只读取页面上的标题、日期、部门，只发给本机 127.0.0.1:8787，不经过任何外部服务器。</p>
  `;
  $('#openPortal').addEventListener('click', () => window.open('/portal', '_blank'));
  const sb = $('#syncNowBtn2');
  if (sb) sb.addEventListener('click', triggerSync);
  $('#gotoPaste').addEventListener('click', () => { state.view = 'wechat'; render(); });
  document.querySelectorAll('.copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = '已复制';
        setTimeout(() => { btn.textContent = '复制路径'; }, 1500);
      } catch (e) { btn.textContent = '复制失败，手动选吧'; }
    });
  });
}

function render() {
  renderUnread();
  document.querySelector('.toolbar').style.display = (state.view === 'wechat' || state.view === 'portal' || state.view === 'acts') ? 'none' : '';
  renderChips();
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.view === state.view));
  if (state.view === 'home') renderHome();
  else if (state.view === 'acts') renderActs();
  else if (state.view === 'portal') renderPortal();
  else if (state.view === 'wechat') renderSources();
  else if (state.view === 'subs') renderSubs();
  else renderMe();
}

// 事件绑定
document.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card && card.dataset.id) openDetail(card.dataset.id);
  const feed = e.target.closest('[data-feed]');
  if (feed) { state.feed = feed.dataset.feed; localStorage.setItem('zl_feed', state.feed); render(); return; }
  if (e.target.closest('#goPortal')) { state.view = 'portal'; render(); return; }
  if (e.target.closest('#syncNowBtn')) { triggerSync(); return; }
  if (e.target.closest('#syncQczd')) { triggerQczd(); return; }
  if (e.target.closest('#syncProfile')) { triggerProfile(); return; }
  if (e.target.closest('#importAct')) { openActImport(); return; }
  const act = e.target.closest('.act');
  if (act && act.dataset.act) openAct(act.dataset.act);
  const src = e.target.closest('.src-item');
  if (src && src.dataset.src) openSource(src.dataset.src);
  const chip = e.target.closest('.chip');
  if (chip && chip.dataset.ab) { state.actBlock = chip.dataset.ab; renderActs(); return; }
  if (chip && chip.dataset.g) { state.srcGroup = chip.dataset.g; renderSources(); }
  else if (chip && chip.dataset.cat) { state.cat = chip.dataset.cat; load(); }
  const tab = e.target.closest('.tab');
  if (tab) {
    state.view = tab.dataset.view;
    if (state.view === 'wechat' && !state.sources) loadSources();
    else render();
  }
});
$('#unreadBtn').addEventListener('click', () => { state.cat = '全部'; state.q = ''; $('#q').value = ''; state.view = 'home'; load(); });
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
function closeSheet() { $('#sheet').classList.remove('open'); $('#sheet').setAttribute('aria-hidden', 'true'); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

let timer;
$('#q').addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 220);
});

// 深链：?view=home|wechat|subs|me / ?item=3 / ?src=1
const params = new URLSearchParams(location.search);
if (params.get('view')) state.view = params.get('view');
if (params.get('feed')) state.feed = params.get('feed');
(async () => {
  await load();
  if (state.view === 'wechat') await loadSources();
  const id = params.get('item');
  if (id) return openDetail(id);
  const sr = params.get('src');
  if (sr) openSource(sr);
})();
