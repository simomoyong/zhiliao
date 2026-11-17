import { loadEnv } from '../lib/ai.mjs';
import { runCrawl } from '../lib/crawl.mjs';

loadEnv();

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);

const report = await runCrawl({ limit: args.limit, only: args.source, dry: args.dry, maxAge: args.maxAge });
for (const r of report) {
  console.log(`[${r.name}] 找到 ${r.found} · 新增 ${r.added} · 跳过 ${r.skipped} · 失败 ${r.failed}${r.error ? ' · ' + r.error : ''}`);
  for (const i of r.items) {
    console.log(`   + [${i.category}] ${i.title.slice(0, 42)}${i.deadline ? '  截止 ' + i.deadline.slice(0, 10) : ''}`);
  }
}
console.log(`\n合计新增 ${report.reduce((s, r) => s + r.added, 0)} 条${args.dry ? '（演练，未写库）' : ''}`);
