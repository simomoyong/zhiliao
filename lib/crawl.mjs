/**
 * 抓取长安大学公开通知列表 → 详情 → 结构化 → 入库
 * 用法：
 *   node scripts/crawl.mjs                 # 全部源，每源 6 条
 *   node scripts/crawl.mjs --limit=10      # 每源 10 条
 *   node scripts/crawl.mjs --source=tw-tzgg
 *   node scripts/crawl.mjs --dry           # 只看解析结果，不写库
 */
import crypto from 'node:crypto';
import { loadEnv, analyze } from '../lib/ai.mjs';
import { insertItem, itemExists, titleExists } from '../lib/db.mjs';

loadEnv();

const SOURCES = [
  { key: 'tw-tzgg', source: '校团委', name: '通知公告', url: 'https://xfjy.chd.edu.cn/tzyg/tzgg.htm' },
  { key: 'tw-hdyg', source: '校团委', name: '活动预告', url: 'https://xfjy.chd.edu.cn/tzyg/hdyg.htm' },
  { key: 'jwc-tzgg', source: '教务处', name: '通知公告', url: 'https://jwc.chd.edu.cn/6998/list.htm' },
  { key: 'jwc-dc', source: '教务处', name: '大创训练计划', url: 'https://jwc.chd.edu.cn/7065/list.htm' },
  { key: 'jwc-js', source: '教务处', name: '学科竞赛', url: 'https://jwc.chd.edu.cn/7064/list.htm' }
];

let LIMIT = 6;
let ONLY = '';
let DRY = false;
let MAX_AGE_DAYS = 210;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function decodeEntities(s = '') {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(s = '') {
  return decodeEntities(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function fetchHtml(url, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 15000);
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' }
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}

function parseList(html, listUrl) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (!/(?:^|\/)(?:info\/\d+\/\d+|\d{4}\/\d{4}\/c\d+a\d+\/page)\.htm/.test(href)) continue;
    const url = new URL(href, listUrl).href.split('#')[0];
    if (seen.has(url)) continue;
    seen.add(url);
    const titleAttr = m[0].match(/title=["']([^"']+)["']/i);
    const title = stripTags(titleAttr ? titleAttr[1] : m[2]).replace(/[\u200b-\u200f\ufeff]/g, '').trim();
    if (!title || title.length < 4) continue;
    out.push({ url, title });
  }
  return out;
}

function dateFromUrl(url) {
  const m = url.match(/\/(20\d{2})\/(\d{2})(\d{2})\//);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function extractArticle(html, url) {
  let h = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const anchor = h.search(/id=["']vsb_content["']|class=["'][^"']*v_news_content|class=["'][^"']*wp_articlecontent/i);
  const seg = anchor >= 0 ? h.slice(anchor, anchor + 24000) : h;
  let ps = [...seg.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((x) => stripTags(x[1]))
    .filter((t) => t.length >= 8 && !/[{};]|document\.|font-/.test(t));
  let body = ps.join('\n');
  if (body.length < 40) body = stripTags(seg);
  body = body.replace(/^(?:发布时间|发布日期|时间)[:：]\s*20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\s*/, '').trim();
  const dateText = stripTags(seg).match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/);
  return { body: body.slice(0, 6000), dateText: dateText ? dateText[0].replace(/[/.]/g, '-') : dateFromUrl(url) };
}

function summarizeDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export async function runCrawl(opts = {}) {
  LIMIT = Number(opts.limit || 6);
  ONLY = opts.only || '';
  DRY = Boolean(opts.dry);
  MAX_AGE_DAYS = Number(opts.maxAge || 210);
  const report = [];
  for (const src of SOURCES) {
    if (ONLY && src.key !== ONLY) continue;
    const row = { key: src.key, name: `${src.source} · ${src.name}`, found: 0, added: 0, skipped: 0, failed: 0, error: '', items: [] };
    try {
      const listHtml = await fetchHtml(src.url);
      const list = parseList(listHtml, src.url).slice(0, LIMIT);
      row.found = list.length;
      for (const it of list) {
        try {
          const detail = await fetchHtml(it.url);
          const art = extractArticle(detail, it.url);
          const published = summarizeDate(art.dateText) || new Date().toISOString().slice(0, 10);
          if (new Date(published) < new Date(Date.now() - MAX_AGE_DAYS * 864e5)) { row.skipped++; continue; }
          const ext = crypto.createHash('sha1').update(it.url).digest('hex').slice(0, 16);
          if (itemExists(ext) || titleExists(it.title)) { row.skipped++; continue; }
          const a = await analyze({ title: it.title, body: art.body, source: src.source, publishedAt: published, url: it.url });
          if (!DRY) {
            insertItem({
              ext_id: ext,
              title: it.title,
              source: `${src.source} · ${src.name}`,
              source_type: '官网',
              category: a.category,
              summary: a.summary,
              published_at: `${published}T09:00:00+08:00`,
              deadline: a.deadline,
              signup_url: a.signup_url,
              audience: a.audience,
              url: it.url,
              body: art.body
            });
          }
          row.added++;
          row.items.push({ title: it.title, category: a.category, deadline: a.deadline, mode: a.mode });
        } catch (e) {
          row.failed++;
          row.error = String(e.message || e);
        }
        await new Promise((r) => setTimeout(r, 700));
      }
    } catch (e) {
      row.error = String(e.message || e);
    }
    report.push(row);
  }

  return report;
}

