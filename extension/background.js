const API = 'http://127.0.0.1:8787/api/import/batch';
const PORTAL = 'https://portal.chd.edu.cn/qljfwapp/sys/lwPsTzggApp/*default/index.do?qq_aio_chat_type=2#/tzgg';
const PORTAL_SERVICE = 'https://portal.chd.edu.cn/qljfwapp/sys/lwPsTzggApp/*default/index.do?qq_aio_chat_type=2';
const LOGIN = 'https://ids.chd.edu.cn/authserver/login?service=' + encodeURIComponent(PORTAL_SERVICE);
const MAX_SEEN = 3000;

let returnAfterLogin = false;

async function getSeen() {
  const { seen = [] } = await chrome.storage.local.get('seen');
  return new Set(seen);
}

async function saveSeen(set) {
  await chrome.storage.local.set({ seen: [...set].slice(-MAX_SEEN) });
}

async function focusTab(tab) {
  try {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  } catch (e) {}
}

async function backToApp() {
  returnAfterLogin = false;
  try {
    const tabs = await chrome.tabs.query({ url: ['http://127.0.0.1:8787/*', 'http://localhost:8787/*'] });
    if (tabs.length) await focusTab(tabs[0]);
  } catch (e) {}
}

async function sync(items) {
  // 即使没有新内容也发一次空数组，让服务端记下“刚刚检查过”
  const seen = await getSeen();
  const fresh = (items || []).filter((it) => it.title && !seen.has(it.title));

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: fresh })
    });
    const r = await res.json();
    fresh.forEach((it) => seen.add(it.title));
    await saveSeen(seen);
    await chrome.storage.local.set({
      lastSync: Date.now(),
      lastAdded: r.added || 0,
      lastMessage: r.added ? `新增 ${r.added} 条` : '没有新内容'
    });
    chrome.action.setBadgeBackgroundColor({ color: '#17385C' });
    chrome.action.setBadgeText({ text: r.added ? String(r.added) : '' });
    if (returnAfterLogin) await backToApp();
    return r;
  } catch (e) {
    await chrome.storage.local.set({
      lastSync: Date.now(),
      lastMessage: '连不上本机知了（127.0.0.1:8787），确认服务开着'
    });
    return { error: String(e.message || e) };
  }
}

function waitComplete(tabId, timeout = 12000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = async () => {
      try {
        const t = await chrome.tabs.get(tabId);
        if (t.status === 'complete') return resolve(t);
        if (Date.now() - started > timeout) return resolve(t);
      } catch (e) {
        return resolve(null);
      }
      setTimeout(tick, 400);
    };
    tick();
  });
}


function sendScan(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'scan' }, () => resolve(!chrome.runtime.lastError));
  });
}

async function ensureAndScan(tabId) {
  if (await sendScan(tabId)) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch (e) {
    return false;
  }
  await new Promise((r) => setTimeout(r, 400));
  return await sendScan(tabId);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'sync') return;
  sync(msg.items || []).then(sendResponse);
  return true;
});


function askQczd(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'qczd-scan' }, (res) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(res || null);
    });
  });
}

async function ensureQczd(tabId) {
  let r = await askQczd(tabId);
  if (r) return r;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['qczd.js'] });
  } catch (e) { return null; }
  await new Promise((res) => setTimeout(res, 500));
  return await askQczd(tabId);
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'qczd-profile') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: ['https://win.9xueqi.com/*', 'https://2kt.9xueqi.com/*'] });
        if (!tabs.length) return sendResponse({ ok: false, mode: 'no-tab' });
        let r = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'qczd-profile' }, (res) => resolve(chrome.runtime.lastError ? null : res));
        });
        if (!r) {
          try { await chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ['qczd.js'] }); } catch (e) {}
          await new Promise((res) => setTimeout(res, 400));
          r = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'qczd-profile' }, (res) => resolve(chrome.runtime.lastError ? null : res));
          });
        }
        if (!r || !r.profile) return sendResponse({ ok: false, mode: 'empty' });
        const pr = await fetch('http://127.0.0.1:8787/api/import/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(r.profile)
        });
        const out = await pr.json();
        return sendResponse({ ok: true, profile: out.profile, url: r.url });
      } catch (e) {
        return sendResponse({ ok: false, error: String(e.message || e) });
      }
    })();
    return true;
  }

  if (msg && msg.type === 'qczd-now') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: ['https://2kt.9xueqi.com/*', 'https://win.9xueqi.com/*'] });
        if (!tabs.length) {
          await chrome.tabs.create({ url: 'https://win.9xueqi.com/#/searthSchool', active: true });
          return sendResponse({ ok: true, mode: 'open' });
        }
        let all = [];
        let samples = [];
        let xhr = [];
        for (const t of tabs) {
          const r = await ensureQczd(t.id);
          if (r && r.items) {
            all = all.concat(r.items);
            samples = samples.concat(r.samples || []);
            xhr = xhr.concat(r.xhr || []);
          }
        }
        if (!all.length) {
          try {
            await fetch('http://127.0.0.1:8787/api/debug/qczd', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ samples: samples.slice(0, 15), xhr: xhr.slice(0, 4), url: tabs[0].url })
            });
          } catch (e) {}
          return sendResponse({ ok: true, mode: 'empty', samples: samples.length });
        }
        const res = await fetch('http://127.0.0.1:8787/api/import/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: all })
        });
        const out = await res.json();
        return sendResponse({ ok: true, mode: 'synced', count: out.upserted || 0 });
      } catch (e) {
        return sendResponse({ ok: false, error: String(e.message || e) });
      }
    })();
    return true;
  }

  if (!msg || msg.type !== 'sync-now') return;
  (async () => {
    try {
      // 1) 门户已经开着：静默扫描，不切换标签页
      const portalTabs = await chrome.tabs.query({ url: 'https://portal.chd.edu.cn/*' });
      if (portalTabs.length) {
        const results = await Promise.all(portalTabs.map((t) => ensureAndScan(t.id)));
        return sendResponse({ ok: true, mode: 'scan', tabs: portalTabs.length, injected: results.some(Boolean) });
      }

      // 2) 已经有登录页：聚焦过去（只有需要你输入登录信息时才打扰）
      const loginTabs = await chrome.tabs.query({ url: 'https://ids.chd.edu.cn/*' });
      if (loginTabs.length) {
        returnAfterLogin = true;
        await focusTab(loginTabs[0]);
        return sendResponse({ ok: true, mode: 'login-existing' });
      }

      // 3) 都没有：后台静默开一个，边加载边等注入，登录就切过去
      const tab = await chrome.tabs.create({ url: PORTAL, active: false });
      let sent = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 400));
        let t = null;
        try { t = await chrome.tabs.get(tab.id); } catch (e) { break; }
        if (t && /ids\.chd\.edu\.cn/.test(t.url || '')) {
          returnAfterLogin = true;
          await focusTab(tab);
          return sendResponse({ ok: true, mode: 'login' });
        }
        const ok = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tab.id, { type: 'scan' }, () => resolve(!chrome.runtime.lastError));
        });
        if (ok) { sent = true; break; }
        try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); } catch (e) {}
      }
      setTimeout(async () => { try { await chrome.tabs.remove(tab.id); } catch (e) {} }, 4000);
      sendResponse({ ok: true, mode: 'scan-bg', sent });
    } catch (e) {
      sendResponse({ ok: false, error: String(e.message || e) });
    }
  })();
  return true;
});

/* 每 15 分钟推一下已经打开的门户标签页，让后台标签也能同步 */
async function nudgePortalTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://portal.chd.edu.cn/*' });
    for (const t of tabs) { await ensureAndScan(t.id); }
  } catch (e) {}
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('tick', { periodInMinutes: 15 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('tick', { periodInMinutes: 15 }));
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'tick') nudgePortalTabs(); });
