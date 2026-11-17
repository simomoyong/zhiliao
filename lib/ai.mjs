import fs from 'node:fs';
import path from 'node:path';

// ---- 极简 .env 读取（不依赖 dotenv）----
export function loadEnv(file = path.join(process.cwd(), '.env')) {
  if (!fs.existsSync(file)) return;
  const txt = fs.readFileSync(file, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

export function hasAI() {
  return Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim());
}

const CATEGORIES = ['竞赛', '奖助', '教务', '就业', '讲座', '生活', '其他'];

const RULES = [
  ['奖助', ['奖学金', '助学金', '资助', '评优', '困难认定', '补助', '圆梦行动']],
  ['就业', ['招聘', '宣讲', '实习', '求职', '双选', '校招', '网申', '就业']],
  ['会议', ['会议', '例会', '座谈会', '研讨会', '验收会']],
  ['讲座', ['讲座', '沙龙', '学术报告', '讲堂', '论坛', '分享会', '培训']],
  ['生活', ['停水', '停电', '食堂', '宿舍', '校医院', '后勤', '歌手', '文艺', '晚会', '文体']],
  ['竞赛', ['挑战杯', '大赛', '竞赛', '选拔赛', '参赛', '科技节', '创新训练', '大创', '国创', '创客', '作品征集']],
  ['教务', ['教材', '考试', '选课', '缓考', '学籍', '四六级', 'CET', '成绩', '课表', '教学', '教务', '课程', '培养方案', '普通话', '选修课', '测试']],
  ['行政', ['工资', '晚点名', '值班', '聘任', '公示', '调查', '报送', '工作提示', '任免', '述职', '考核']]
];

export function ruleCategory(text = '') {
  for (const [cat, words] of RULES) {
    if (words.some((w) => text.includes(w))) return cat;
  }
  if (/公示|名单|聘任|值班|安排表|结果/.test(text)) return '行政';
  return '其他';
}

export function classify(title = '', body = '') {
  const byTitle = ruleCategory(title);
  return byTitle !== '其他' ? byTitle : ruleCategory(body);
}

function pad(n) { return String(n).padStart(2, '0'); }

const DATE_RE = /(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?|(?<![\d年])(\d{1,2})月(\d{1,2})日/g;

export function ruleDeadline(text = '', publishedAt = '') {
  const pub = publishedAt ? new Date(publishedAt) : new Date();
  const year = Number.isNaN(pub.getTime()) ? new Date().getFullYear() : pub.getFullYear();
  let best = '';
  DATE_RE.lastIndex = 0;
  let m;
  while ((m = DATE_RE.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 24), m.index);
    const after = text.slice(m.index, m.index + 40);
    const hasCtx = /截止|报名|申报|提交|截至|报送|申请/.test(before) || /前(?!往)|截止/.test(after.slice(0, 12));
    if (!hasCtx) continue;
    let y, mo, d;
    if (m[1]) { [, y, mo, d] = m; } else { y = year; mo = m[4]; d = m[5]; }
    const dt = new Date(`${y}-${pad(mo)}-${pad(d)}T23:59:00+08:00`);
    if (Number.isNaN(dt.getTime())) continue;
    if (dt < new Date(pub.getTime() - 864e5)) continue;       // 早于发布日的忽略
    if (dt < new Date(Date.now() - 864e5 * 7)) continue;      // 七天前已过的忽略
    if (!best || dt < new Date(best)) best = `${y}-${pad(mo)}-${pad(d)}T23:59:00+08:00`;
  }
  return best;
}

export function ruleSummary(text = '') {
  let clean = String(text).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  // 去掉“各分团委：”“各位同学：”这类称呼
  clean = clean.replace(/^[^：]{0,40}：\s*/, '');
  const parts = clean.split(/[。；;]/).map((s) => s.trim()).filter((s) => s.length >= 8 && !/附件|已下载|版权所有|邮编|电话|邮箱|浏览次数|点击量/.test(s));
  // 优先选含时间/报名/地点的那句，否则选最长的一句
  const prefer = parts.find((p) => /(截止|报名|举行|地点|时间|前完成|申报)/.test(p));
  const pick = prefer || parts.slice().sort((a, b) => b.length - a.length)[0] || clean;
  return pick.length > 72 ? pick.slice(0, 72) + '…' : pick;
}

/**
 * 结构化一条通知。有 Key 走大模型，没有则降级为规则。
 * 返回 { category, summary, deadline, signup_url, audience, mode }
 */
export async function analyze({ title = '', body = '', source = '', publishedAt = '', url = '' }) {
  const text = `${title}\n${body}`.slice(0, 6000);
  if (!hasAI()) {
    return {
      category: classify(title, body),
      summary: ruleSummary(body || title),
      deadline: ruleDeadline(text, publishedAt),
      signup_url: url || '',
      audience: '',
      mode: 'rule'
    };
  }
  try {
    const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25000);
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是校园通知信息抽取器。只输出 JSON，不要解释。字段：category（只能是 竞赛/奖助/教务/就业/讲座/生活/其他）、summary（一句话，不超过 60 字）、deadline（ISO8601，带 +08:00；无法确定填 ""）、signup_url（填 "" ）、audience（适用人群，不超过 20 字）。规则：相对时间按发布时间换算；不确定的日期不要编造。'
          },
          {
            role: 'user',
            content: `发布时间：${publishedAt || '未知'}\n来源：${source}\n标题：${title}\n正文：\n${text}`
          }
        ]
      })
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const j = JSON.parse(raw);
    return {
      category: CATEGORIES.includes(j.category) ? j.category : classify(title, body),
      summary: (j.summary || ruleSummary(body || title)).slice(0, 120),
      deadline: /^\d{4}-\d{2}-\d{2}T/.test(j.deadline || '') ? j.deadline : ruleDeadline(text, publishedAt),
      signup_url: j.signup_url || url || '',
      audience: j.audience || '',
      mode: 'ai'
    };
  } catch (err) {
    return {
      category: classify(title, body),
      summary: ruleSummary(body || title),
      deadline: ruleDeadline(text, publishedAt),
      signup_url: url || '',
      audience: '',
      mode: 'rule',
      error: String(err.message || err)
    };
  }
}
