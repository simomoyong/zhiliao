import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'zhiliao.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id TEXT UNIQUE,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT '官网',
  category TEXT NOT NULL DEFAULT '其他',
  summary TEXT,
  published_at TEXT,
  deadline TEXT,
  signup_url TEXT,
  audience TEXT,
  url TEXT,
  body TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  is_saved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS prefs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_cat ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_deadline ON items(deadline);
`);

const SEED = [
  {
    ext_id: 'seed-1',
    title: '关于 2026 年秋季学期国家助学金评审工作的通知',
    source: '学生工作部 / 资助中心',
    source_type: '官网',
    category: '奖助',
    summary: '面向已通过家庭经济困难认定的本科生，一等 4400 元/年、二等 3300 元/年，需在学工系统提交申请表与佐证材料，逾期不再受理。',
    published_at: '2026-11-13T09:20:00+08:00',
    deadline: '2026-11-21T17:00:00+08:00',
    signup_url: 'https://xgb.chd.edu.cn/',
    audience: '全校本科生（家庭经济困难认定通过者）',
    url: 'https://xgb.chd.edu.cn/',
    body: '各学院：根据教育部相关文件精神，现开展 2026 年秋季学期国家助学金评审工作。请各学院于 11 月 21 日 17:00 前完成材料审核与系统提交。'
  },
  {
    ext_id: 'seed-2',
    title: '“智能网联汽车与未来出行”学术讲座（第 128 期）',
    source: '汽车学院 · 学术沙龙',
    source_type: '公众号',
    category: '讲座',
    summary: '11 月 18 日 14:30 在学术交流中心第三会议室举行，主讲人为同济大学交通学院教授，可计入创新学分 0.2 分。',
    published_at: '2026-11-12T16:00:00+08:00',
    deadline: '2026-11-18T14:00:00+08:00',
    signup_url: '',
    audience: '全校师生，无需报名',
    url: '',
    body: '讲座题目：智能网联汽车与未来出行。时间：11 月 18 日 14:30。地点：学术交流中心第三会议室。'
  },
  {
    ext_id: 'seed-3',
    title: '2026—2027 学年第一学期期末考试安排查询通知',
    source: '教务处 / 本科生教学网',
    source_type: '官网',
    category: '教务',
    summary: '考试安排已发布，可在教务系统「考试查询」查看；缓考申请截止 11 月 28 日，需学院教学院长签字后交教务处。',
    published_at: '2026-11-10T10:00:00+08:00',
    deadline: '2026-11-28T17:00:00+08:00',
    signup_url: 'https://jwc.chd.edu.cn/',
    audience: '全体在校本科生',
    url: 'https://jwc.chd.edu.cn/',
    body: '各学院：本学期期末考试安排已发布，请通知学生登录教务系统查询。缓考申请截止 11 月 28 日。'
  },
  {
    ext_id: 'seed-4',
    title: '中国交建 2027 届校园招聘 · 长安大学专场',
    source: '学生就业与服务中心',
    source_type: '官网',
    category: '就业',
    summary: '11 月 20 日 14:00 在大学生活动中心举行，现场收取简历；网申同步开放至 11 月 20 日 24:00，需上传成绩单。',
    published_at: '2026-11-11T09:00:00+08:00',
    deadline: '2026-11-20T23:59:00+08:00',
    signup_url: 'https://jyzx.chd.edu.cn/',
    audience: '2027 届本科、硕士毕业生',
    url: 'https://jyzx.chd.edu.cn/',
    body: '中国交通建设集团有限公司 2027 届校园招聘长安大学专场，11 月 20 日下午 14:00，大学生活动中心。'
  },
  {
    ext_id: 'seed-5',
    title: '第十七届“挑战杯”校内选拔赛报名通知',
    source: '校团委',
    source_type: '公众号',
    category: '竞赛',
    summary: '面向全校本科生、研究生，11 月 25 日 18:00 截止报名，需提交项目申报书与作品简介，学院审核后统一报送。',
    published_at: '2026-11-09T15:00:00+08:00',
    deadline: '2026-11-25T18:00:00+08:00',
    signup_url: 'https://xfjy.chd.edu.cn/',
    audience: '全校本科生、研究生',
    url: 'https://xfjy.chd.edu.cn/',
    body: '各分团委：第十七届“挑战杯”全国大学生课外学术科技作品竞赛校内选拔赛开始报名，截止 11 月 25 日 18:00。'
  },
  {
    ext_id: 'seed-6',
    title: '关于南校区部分区域临时停水的通知',
    source: '后勤管理处',
    source_type: '官网',
    category: '生活',
    summary: '因管网检修，11 月 16 日 08:00—16:00 停水，涉及 3—7 号宿舍楼，请提前储水，食堂供水不受影响。',
    published_at: '2026-11-14T08:00:00+08:00',
    deadline: '2026-11-16T08:00:00+08:00',
    signup_url: '',
    audience: '南校区 3—7 号宿舍楼',
    url: 'https://hqc.chd.edu.cn/',
    body: '因管网检修，南校区部分区域将于 11 月 16 日 08:00—16:00 停水。'
  },
  {
    ext_id: 'seed-7',
    title: '2026 年大学生创新训练计划项目申报通知',
    source: '教务处 · 创新创业学院',
    source_type: '官网',
    category: '竞赛',
    summary: '面向本科生团队申报，12 月 1 日截止；需指导教师签字，立项后给予 2000—10000 元经费支持。',
    published_at: '2026-11-08T11:00:00+08:00',
    deadline: '2026-12-01T17:00:00+08:00',
    signup_url: 'https://jwc.chd.edu.cn/',
    audience: '本科生团队（3—5 人）',
    url: 'https://jwc.chd.edu.cn/',
    body: '关于开展 2026 年大学生创新训练计划项目申报工作的通知，截止 12 月 1 日。'
  },
  {
    ext_id: 'seed-8',
    title: '长安大学首届人工智能创新大赛报名启动',
    source: '数据科学与人工智能研究院',
    source_type: '公众号',
    category: '竞赛',
    summary: '面向全校学生，12 月 5 日截止报名，设创意组与应用组，决赛 12 月中旬举行。',
    published_at: '2026-11-07T14:00:00+08:00',
    deadline: '2026-12-05T23:59:00+08:00',
    signup_url: '',
    audience: '全校本科生、研究生',
    url: '',
    body: '长安大学首届人工智能创新大赛报名启动，设创意组与应用组。'
  },
  {
    ext_id: 'seed-9',
    title: '2027 届毕业生秋季综合招聘会（第二场）',
    source: '学生就业与服务中心',
    source_type: '官网',
    category: '就业',
    summary: '11 月 22 日 09:00—16:00 在体育馆举行，参会单位 180 余家，建议携带 10 份纸质简历。',
    published_at: '2026-11-13T10:00:00+08:00',
    deadline: '2026-11-22T09:00:00+08:00',
    signup_url: 'https://jyzx.chd.edu.cn/',
    audience: '2027 届毕业生',
    url: 'https://jyzx.chd.edu.cn/',
    body: '2027 届毕业生秋季综合招聘会第二场，11 月 22 日体育馆。'
  },
  {
    ext_id: 'seed-10',
    title: '关于 2026 年下半年全国大学英语四、六级考试报名的通知',
    source: '教务处',
    source_type: '官网',
    category: '教务',
    summary: '报名截止 11 月 19 日 12:00，笔试 12 月 12 日举行；CET4 未通过者不得报考 CET6。',
    published_at: '2026-11-06T09:00:00+08:00',
    deadline: '2026-11-19T12:00:00+08:00',
    signup_url: 'https://jwc.chd.edu.cn/',
    audience: '在校本科生、研究生',
    url: 'https://jwc.chd.edu.cn/',
    body: '2026 年下半年 CET 报名通知，截止 11 月 19 日 12:00。'
  },
  {
    ext_id: 'seed-11',
    title: '“校园之春”歌手大赛报名开始',
    source: '大学生艺术团',
    source_type: '公众号',
    category: '生活',
    summary: '11 月 24 日截止报名，初赛 11 月 28 日，面向全校学生，可个人或组合参赛。',
    published_at: '2026-11-12T19:00:00+08:00',
    deadline: '2026-11-24T23:59:00+08:00',
    signup_url: '',
    audience: '全校学生',
    url: '',
    body: '“校园之春”歌手大赛开始报名，截止 11 月 24 日。'
  },
  {
    ext_id: 'seed-12',
    title: '图书馆考研自习座位预约规则调整',
    source: '图书馆',
    source_type: '官网',
    category: '教务',
    summary: '11 月 17 日起，考研自习区改为每日预约，需在前一天 20:00 前完成，连续 3 次爽约将暂停预约权限 7 天。',
    published_at: '2026-11-13T16:00:00+08:00',
    deadline: '2026-11-17T20:00:00+08:00',
    signup_url: 'https://lib.chd.edu.cn/',
    audience: '考研学生',
    url: 'https://lib.chd.edu.cn/',
    body: '图书馆考研自习区座位预约规则调整通知。'
  }
];

export function seedIfEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM items').get();
  if (row.n > 0) return;
  const stmt = db.prepare(`INSERT INTO items
    (ext_id,title,source,source_type,category,summary,published_at,deadline,signup_url,audience,url,body)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const it of SEED) {
    stmt.run(it.ext_id, it.title, it.source, it.source_type, it.category, it.summary,
      it.published_at, it.deadline, it.signup_url, it.audience, it.url, it.body);
  }
}

export function listItems({ category = '全部', q = '' } = {}) {
  let sql = `SELECT * FROM items WHERE 1=1`;
  const args = [];
  if (category && category !== '全部') { sql += ` AND category = ?`; args.push(category); }
  if (q) { sql += ` AND (title LIKE ? OR summary LIKE ? OR source LIKE ?)`; const k = `%${q}%`; args.push(k, k, k); }
  sql += ` ORDER BY (deadline IS NULL OR deadline = ''), deadline ASC, published_at DESC`;
  return db.prepare(sql).all(...args);
}

export function getItem(id) {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(Number(id));
}

export function markRead(id) {
  db.prepare('UPDATE items SET is_read = 1 WHERE id = ?').run(Number(id));
}

export function toggleSave(id) {
  const it = getItem(id);
  if (!it) return null;
  const next = it.is_saved ? 0 : 1;
  db.prepare('UPDATE items SET is_saved = ? WHERE id = ?').run(next, Number(id));
  return next;
}

export function unreadCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM items WHERE is_read = 0').get().n;
}

export function getPrefs() {
  const rows = db.prepare('SELECT key, value FROM prefs').all();
  const prefs = { quiet: '23:00-07:30', limit: 3, categories: ['竞赛', '奖助', '教务', '就业', '讲座', '生活', '会议', '行政'] };
  for (const r of rows) {
    try { prefs[r.key] = JSON.parse(r.value); } catch { prefs[r.key] = r.value; }
  }
  return prefs;
}

export function setPrefs(patch) {
  const stmt = db.prepare('INSERT INTO prefs(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const [k, v] of Object.entries(patch)) stmt.run(k, JSON.stringify(v));
  return getPrefs();
}

export function insertItem(it) {
  const stmt = db.prepare(`INSERT INTO items
    (ext_id,title,source,source_type,category,summary,published_at,deadline,signup_url,audience,url,body)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(ext_id) DO NOTHING`);
  return stmt.run(it.ext_id, it.title, it.source, it.source_type, it.category, it.summary,
    it.published_at, it.deadline, it.signup_url, it.audience, it.url, it.body);
}

export function itemExists(extId) {
  return Boolean(db.prepare('SELECT 1 FROM items WHERE ext_id = ?').get(extId));
}

export function titleExists(title) {
  return Boolean(db.prepare('SELECT 1 FROM items WHERE title = ?').get(title));
}


export function seedSnapshot() {
  try {
    const file = path.join(DATA_DIR, 'snapshot.json');
    if (!fs.existsSync(file)) return 0;
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    let added = 0;
    const stmt = db.prepare(`INSERT INTO items
      (ext_id,title,source,source_type,category,summary,published_at,deadline,signup_url,audience,url,body)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(ext_id) DO NOTHING`);
    for (const it of rows) {
      if (db.prepare('SELECT 1 FROM items WHERE title = ?').get(it.title)) continue;
      const r = stmt.run(it.ext_id, it.title, it.source, it.source_type, it.category, it.summary,
        it.published_at, it.deadline, it.signup_url, it.audience, it.url, it.body);
      added += r.changes || 0;
    }
    return added;
  } catch (e) {
    return 0;
  }
}


export function allItemsForMirror() {
  return db.prepare(`SELECT ext_id,title,source,source_type,category,summary,published_at,
    deadline,signup_url,audience,url,body FROM items`).all();
}

export function upsertItems(rows) {
  const stmt = db.prepare(`INSERT INTO items
    (ext_id,title,source,source_type,category,summary,published_at,deadline,signup_url,audience,url,body)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(ext_id) DO UPDATE SET
      title=excluded.title, source=excluded.source, source_type=excluded.source_type,
      category=excluded.category, summary=excluded.summary, published_at=excluded.published_at,
      deadline=excluded.deadline, signup_url=excluded.signup_url, audience=excluded.audience,
      url=excluded.url, body=excluded.body`);
  let n = 0;
  for (const r of rows || []) {
    if (!r || !r.ext_id || !r.title) continue;
    stmt.run(r.ext_id, r.title, r.source || '', r.source_type || '官网', r.category || '其他',
      r.summary || '', r.published_at || '', r.deadline || '', r.signup_url || '',
      r.audience || '', r.url || '', r.body || '');
    n += 1;
  }
  return n;
}
