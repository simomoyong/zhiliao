import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { loadEnv, hasAI, analyze } from './lib/ai.mjs';
import { runCrawl } from './lib/crawl.mjs';
import { sendPush, publicKey } from './lib/push.mjs';
import {
  seedIfEmpty, seedSnapshot, seedActivities, listActivities, insertActivities, getProfile, setProfile,
  listItems, allItemsForMirror, upsertItems, addPushSub, listPushSubs, removePushSub, getItem, markRead, toggleSave, unreadCount,
  getPrefs, setPrefs, insertItem, itemExists, titleExists
} from './lib/db.mjs';

loadEnv();
seedIfEmpty();
seedActivities();
const snapshotAdded = seedSnapshot();
if (snapshotAdded) console.log(`已从快照导入 ${snapshotAdded} 条真实通知`);

let SOURCES = [];
try {
  SOURCES = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/sources.json'), 'utf8'));
} catch (e) {
  console.warn('未找到 data/sources.json，信源页将为空');
}

const PORT = Number(process.env.PORT || 8787);
const PUBLIC = path.join(process.cwd(), 'public');
const MIRROR_TOKEN = process.env.MIRROR_TOKEN || '';
const MIRROR_URL = process.env.MIRROR_URL || '';
const PORTAL_URL = process.env.PORTAL_URL || 'https://portal.chd.edu.cn/qljfwapp/sys/lwPsTzggApp/*default/index.do?qq_aio_chat_type=2#/tzgg';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'
  });
  res.end(body);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

function icsEscape(s = '') {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function toICS(items, acts = []) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//zhiliao//campus notice//CN', 'CALSCALE:GREGORIAN'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  for (const it of items) {
    if (!it.deadline) continue;
    const d = new Date(it.deadline);
    if (Number.isNaN(d.getTime())) continue;
    const dt = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const uid = `zhiliao-${it.id}@local`;
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART:${dt}`, `SUMMARY:${icsEscape('截止：' + it.title)}`);
    if (it.summary) lines.push(`DESCRIPTION:${icsEscape(it.summary)}`);
    if (it.url) lines.push(`URL:${it.url}`);
    lines.push('BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:明天截止', 'END:VALARM');
    lines.push('BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:2 小时后截止', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  for (const a of acts) {
    if (!a.deadline) continue;
    const d = new Date(a.deadline);
    if (Number.isNaN(d.getTime())) continue;
    const dt = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    lines.push('BEGIN:VEVENT', `UID:zhiliao-act-${a.id}@local`, `DTSTAMP:${stamp}`, `DTSTART:${dt}`,
      `SUMMARY:${icsEscape(`二课截止：${a.title}（${a.block || ''} +${a.credits || 0} 积分）`)}`);
    if (a.location) lines.push(`LOCATION:${icsEscape(a.location)}`);
    lines.push('BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:明天截止', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function extractFromHtml(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  const og = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || '';
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title: og || title, body: body.slice(0, 6000) };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const p = decodeURIComponent(u.pathname);

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'
      });
      return res.end();
    }

    if (p === '/portal') {
      res.writeHead(302, { Location: PORTAL_URL });
      return res.end();
    }

    if (p === '/login') {
      const service = PORTAL_URL.split('#')[0];
      const login = 'https://ids.chd.edu.cn/authserver/login?service=' + encodeURIComponent(service);
      res.writeHead(302, { Location: login });
      return res.end();
    }

    if (p === '/api/portal-status') {
      const pr = getPrefs();
      return json(res, 200, {
        lastSync: pr.last_portal_sync || '',
        added: Number(pr.last_portal_added || 0),
        total: Number(pr.portal_import_total || 0),
        url: PORTAL_URL
      });
    }

    if (p === '/api/health') {
      return json(res, 200, { ok: true, ai: hasAI(), items: listItems().length, unread: unreadCount() });
    }

    if (p === '/api/mirror' && req.method === 'POST') {
      if (!MIRROR_TOKEN || req.headers['x-mirror-token'] !== MIRROR_TOKEN) {
        return json(res, 401, { error: 'unauthorized' });
      }
      const { items = [] } = await readBody(req);
      const upserted = upsertItems(items);
      console.log(`[mirror] 收到 ${items.length} 条，写入 ${upserted} 条`);
      return json(res, 200, { ok: true, upserted });
    }

    if (p === '/api/debug/qczd' && req.method === 'POST') {
      const data = await readBody(req);
      fs.mkdirSync('logs', { recursive: true });
      fs.appendFileSync('logs/qczd-debug.log', JSON.stringify({ at: new Date().toISOString(), ...data }) + '\n');
      console.log(`[qczd] 收到 ${ (data.samples || []).length } 条页面样本，已存 logs/qczd-debug.log`);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/push/public-key') {
      return json(res, 200, { key: publicKey() });
    }

    if (p === '/api/push/subscribe' && req.method === 'POST') {
      const { subscription } = await readBody(req);
      addPushSub(subscription);
      console.log('[push] 新订阅', subscription && subscription.endpoint ? subscription.endpoint.slice(0, 60) : '');
      return json(res, 200, { ok: true });
    }

    if (p === '/api/push/unsubscribe' && req.method === 'POST') {
      const { endpoint } = await readBody(req);
      return json(res, 200, { ok: true, removed: removePushSub(endpoint) });
    }

    if (p === '/api/push/test' && req.method === 'POST') {
      const subs = listPushSubs();
      const results = await Promise.all(subs.map(async (sub) => {
        try {
          const r = await sendPush(sub);
          if (!r.ok && (r.status === 404 || r.status === 410)) removePushSub(sub.endpoint);
          return r;
        } catch (e) {
          return { ok: false, error: String(e.message || e) };
        }
      }));
      const mac = macNotify('知了 · 测试通知', '如果你看到这条，说明系统通知链路是通的');
      return json(res, 200, { ok: true, sent: subs.length, mac, results });
    }

    if (p === '/api/profile' && req.method === 'GET') {
      return json(res, 200, getProfile());
    }

    if (p === '/api/import/profile' && req.method === 'POST') {
      const data = await readBody(req);
      const out = setProfile(data);
      console.log('[profile] 我的积分已更新', out);
      return json(res, 200, { ok: true, profile: out });
    }

    if (p === '/api/activities') {
      return json(res, 200, { items: listActivities() });
    }

    if (p === '/api/import/activities' && req.method === 'POST') {
      const { items = [] } = await readBody(req);
      const rows = items.map((a) => ({
        ...a,
        ext_id: a.ext_id || crypto.createHash('sha1').update(String(a.title).replace(/\s+/g, '')).digest('hex').slice(0, 16)
      }));
      const n = insertActivities(rows);
      return json(res, 200, { ok: true, upserted: n });
    }

    if (p === '/api/sources') {
      return json(res, 200, { sources: SOURCES, total: SOURCES.length });
    }

    if (p === '/api/items' && req.method === 'GET') {
      const items = listItems({ category: u.searchParams.get('category') || '全部', q: u.searchParams.get('q') || '' });
      return json(res, 200, { items, unread: unreadCount(), prefs: getPrefs() });
    }

    const mItem = p.match(/^\/api\/items\/(\d+)$/);
    if (mItem && req.method === 'GET') {
      const it = getItem(mItem[1]);
      return it ? json(res, 200, it) : json(res, 404, { error: 'not found' });
    }

    const mRead = p.match(/^\/api\/items\/(\d+)\/read$/);
    if (mRead && req.method === 'POST') { markRead(mRead[1]); return json(res, 200, { ok: true }); }

    const mSave = p.match(/^\/api\/items\/(\d+)\/save$/);
    if (mSave && req.method === 'POST') {
      const v = toggleSave(mSave[1]);
      return v === null ? json(res, 404, { error: 'not found' }) : json(res, 200, { saved: v });
    }

    if (p === '/api/prefs' && req.method === 'GET') return json(res, 200, getPrefs());
    if (p === '/api/prefs' && req.method === 'PUT') {
      const patch = await readBody(req);
      return json(res, 200, setPrefs(patch));
    }

    if (p === '/api/ics') {
      const items = listItems();
      res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="zhiliao.ics"' });
      return res.end(toICS(items, listActivities()));
    }


    if (p === '/api/import/batch' && req.method === 'POST') {
      const t0 = Date.now();
      const { items = [] } = await readBody(req);
      let added = 0, skipped = 0, failed = 0;
      const samples = [];
      for (const it of items.slice(0, 300)) {
        try {
          const title = String(it.title || '').replace(/\s+/g, ' ').trim();
          if (title.length < 6) { skipped++; continue; }
          const url = String(it.url || '');
          const ext = crypto.createHash('sha1').update(url || title).digest('hex').slice(0, 16);
          if (itemExists(ext) || titleExists(title)) { skipped++; continue; }
          const published = (it.date && /\d{4}-\d{2}-\d{2}/.test(it.date)) ? it.date : new Date().toISOString().slice(0, 10);
          const a = await analyze({ title, body: it.summary || '', source: it.department || '校园门户', publishedAt: published, url });
          insertItem({
            ext_id: ext, title, source: it.department || '校园门户 · 通知公告', source_type: '官网',
            category: a.category, summary: a.summary || title, published_at: `${published}T09:00:00+08:00`,
            deadline: a.deadline, signup_url: url, audience: a.audience, url, body: it.summary || ''
          });
          added++;
          if (samples.length < 5) samples.push({ title, category: a.category });
        } catch (e) { failed++; }
      }
      {
        const pr = getPrefs();
        setPrefs({
          last_portal_sync: new Date().toISOString(),
          last_portal_added: added,
          portal_import_total: Number(pr.portal_import_total || 0) + added
        });
      }
      console.log(`[portal] 收到 ${items.length} 条，新增 ${added}，用时 ${Date.now() - t0}ms`);
      if (added > 0) scheduleMirror();
      return json(res, 200, { ok: true, added, skipped, failed, samples });
    }

    if (p === '/api/import' && req.method === 'POST') {
      const { url = '', title = '', body = '' } = await readBody(req);
      let t = title, b = body, finalUrl = url;
      if (!t && url) {
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 zhiliao/0.1' } });
        if (!r.ok) throw new Error(`抓取失败 ${r.status}`);
        const html = await r.text();
        const ex = extractFromHtml(html);
        t = ex.title; b = ex.body;
      }
      if (!t) return json(res, 400, { error: '缺少标题或链接' });
      const a = await analyze({ title: t, body: b, source: new URL(url || 'https://local').hostname, publishedAt: new Date().toISOString(), url: finalUrl });
      const ext = crypto.createHash('sha1').update(t + (url || '')).digest('hex').slice(0, 16);
      insertItem({
        ext_id: ext, title: t, source: new URL(url || 'https://local').hostname, source_type: '公众号',
        category: a.category, summary: a.summary, published_at: new Date().toISOString(),
        deadline: a.deadline, signup_url: a.signup_url, audience: a.audience, url: finalUrl, body: b
      });
      return json(res, 200, { ok: true, mode: a.mode, category: a.category });
    }

    // ---- 静态文件 ----
    let file = p === '/' ? '/index.html' : p;
    const abs = path.normalize(path.join(PUBLIC, file));
    if (!abs.startsWith(PUBLIC)) return json(res, 403, { error: 'forbidden' });
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
    fs.createReadStream(abs).pipe(res);
  } catch (err) {
    json(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`知了 · 本地服务已启动  http://127.0.0.1:${PORT}`);
  console.log(`AI 模式：${hasAI() ? '已连接 DeepSeek' : '未配置 Key，降级为规则模式'}`);
});

/* macOS 本机通知：不依赖任何外网推送服务 */
function macNotify(title, body) {
  if (process.platform !== 'darwin') return false;
  const esc = (x) => String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `display notification "${esc(body)}" with title "${esc(title)}"`;
  execFile('osascript', ['-e', script], (err) => {
    if (err) console.log('[mac] 通知失败：', err.message);
  });
  return true;
}

/* 有新通知时推送到订阅设备 */
async function notifyPush(text = '有新的校园通知') {
  const subs = listPushSubs();
  if (!subs.length) return;
  let ok = 0;
  for (const sub of subs) {
    const r = await sendPush(sub);
    if (r.ok) ok += 1;
    else if (r.status === 404 || r.status === 410) removePushSub(sub.endpoint);
  }
  console.log(`[push] ${text}：${ok}/${subs.length} 成功`);
  if (!ok) macNotify('知了 · 校园通知', text);
}

/* 把本机数据推到线上（有 MIRROR_URL 才启用） */
let mirrorTimer = null;
async function mirrorNow() {
  if (!MIRROR_URL || !MIRROR_TOKEN) return;
  try {
    if (new URL(MIRROR_URL).hostname === '127.0.0.1' || new URL(MIRROR_URL).hostname === 'localhost') return;
  } catch (e) { return; }
  try {
    const res = await fetch(`${MIRROR_URL.replace(/\/$/, '')}/api/mirror`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mirror-token': MIRROR_TOKEN },
      body: JSON.stringify({ items: allItemsForMirror() })
    });
    const r = await res.json();
    console.log(`[mirror] 推送 ${r.upserted ?? 0} 条到线上`);
  } catch (e) {
    console.log('[mirror] 失败：', e.message);
  }
}
function scheduleMirror(delay = 4000) {
  if (!MIRROR_URL || !MIRROR_TOKEN) return;
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(mirrorNow, delay);
}

/* 每 30 分钟自动抓一次官网通知 */
let crawling = false;
async function scheduledCrawl() {
  if (crawling) return;
  crawling = true;
  const t0 = Date.now();
  try {
    const report = await runCrawl({ limit: 6 });
    const added = report.reduce((sum, r) => sum + r.added, 0);
    const failed = report.reduce((sum, r) => sum + r.failed, 0);
    console.log(`[crawl] ${new Date().toLocaleString('zh-CN', { hour12: false })} 新增 ${added} 条，失败 ${failed}，用时 ${Date.now() - t0}ms`);
    if (added > 0) { scheduleMirror(); notifyPush(`官网新增 ${added} 条`); }
  } catch (e) {
    console.error('[crawl] 失败：', e.message);
  } finally {
    crawling = false;
  }
}
setTimeout(scheduledCrawl, 10000);
setInterval(scheduledCrawl, 30 * 60 * 1000);
