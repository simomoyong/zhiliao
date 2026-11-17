# 知了 · 校园通知

在线演示：https://zhiliao-51t1.onrender.com （免费实例会休眠，首次打开约 30 秒）

长安大学校园通知聚合与提醒。课程原型（人工智能导论 · 题目二）。

## 运行

需要 Node.js 22.5 以上（用到内置 `node:sqlite`）。**不需要安装任何依赖。**

```bash
cd zhiliao/app
node server.mjs
# 打开 http://127.0.0.1:8787
```

首次启动会自动建库并写入 12 条示例通知（`data/zhiliao.db`）。

## 配置 AI（可选）

```bash
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY=sk-...
```

不填也能跑：自动降级为「规则模式」——关键词分类 + 截断摘要 + 正则抽日期。
填了之后，「我的」页会显示「已连接 DeepSeek」，导入文章时走大模型结构化。

**纪律：`.env` 不进 Git、不截图、不发聊天。**

## 目录

```
app/
├── server.mjs          # HTTP 服务 + API + 静态文件
├── lib/db.mjs          # SQLite 建表、示例数据、查询
├── lib/ai.mjs          # .env 读取、DeepSeek 调用、规则降级
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js          # 前端：通知流 / 详情 / 订阅 / 我的
└── data/zhiliao.db     # 运行时生成，已 gitignore
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查，返回 AI 是否配置 |
| GET | `/api/sources` | 公众号信源（66 条，来自 `data/sources.json`） |
| GET | `/api/items?category=&q=` | 通知列表 |
| GET | `/api/items/:id` | 单条详情 |
| POST | `/api/items/:id/read` | 标记已读 |
| POST | `/api/items/:id/save` | 收藏 / 取消 |
| GET/PUT | `/api/prefs` | 订阅偏好 |
| GET | `/api/ics` | 导出日历（含截止前 1 天 / 2 小时提醒） |
| POST | `/api/import` | 导入单篇文章（`{url}`） |

## 已完成 / 未完成

已完成：通知流、搜索、分类筛选、详情、收藏、已读、订阅开关、日历导出、文章导入、AI/规则双模式；公众号信源页（66 条、17 个二维码、分组筛选、扫码查看、单篇导入）。

未完成：真实抓取 5 个源、定时任务、Web Push、账号体系、部署。


## 抓取真实数据

```bash
node scripts/crawl.mjs --limit=5      # 每源抓 5 条
node scripts/crawl.mjs --dry          # 只解析，不写库
node scripts/crawl.mjs --source=tw-hdyg
```

已接的源（都是公开列表页）：

| key | 来源 | 状态 |
|---|---|---|
| tw-tzgg | 团委 · 通知公告 | 活跃 |
| tw-hdyg | 团委 · 活动预告 | 最活跃，竞赛/科技节多 |
| jwc-tzgg | 教务处 · 通知公告 | 更新慢（最新 2026-08） |
| jwc-dc | 教务处 · 大创训练计划 | 稀疏 |
| jwc-js | 教务处 · 学科竞赛 | 实为新闻栏目（2023–2024），不建议用 |

脚本会：限速 700ms、按 URL 与标题去重、跳过 210 天前的旧文、抓详情正文、走 AI/规则结构化、入库。
就业网首页是门户页（JS 渲染），暂未接入。

## 二维码

`public/qr/` 放二维码图片，`data/sources.json` 里 `qr` 字段指向它。待补清单见仓库外的 `zhiliao/待补二维码清单.csv`。

## 部署备注

单进程 + SQLite，适合部署到任意支持 Node 的服务器（Render / Railway / 校内服务器），带持久磁盘即可。
若部署到 Vercel 这类无状态平台，需要把 `lib/db.mjs` 换成 Postgres/Turso。

## 部署（Render）

仓库里已带 `Dockerfile` 和 `render.yaml`，Render 可以直接识别：

1. Render → New → Web Service → 选这个仓库；
2. 它会读到 Dockerfile，Region 任选，Plan 选 Free；
3. Health Check Path 填 `/api/health`；
4. 部署完成后拿到 `https://xxx.onrender.com`。

注意：免费实例闲置会休眠；磁盘是临时的，重启后数据会重新抓一遍（启动时自动执行一次抓取）。真实使用建议绑定持久磁盘或换 Postgres。
