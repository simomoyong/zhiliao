import { loadEnv } from '../lib/ai.mjs';
import { allItemsForMirror } from '../lib/db.mjs';

loadEnv();
const url = process.env.MIRROR_URL;
const token = process.env.MIRROR_TOKEN;
if (!url || !token) { console.error('缺少 MIRROR_URL 或 MIRROR_TOKEN'); process.exit(1); }

const items = allItemsForMirror();
console.log(`本地 ${items.length} 条，开始推送 → ${url}`);
const res = await fetch(`${url.replace(/\/$/, '')}/api/mirror`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-mirror-token': token },
  body: JSON.stringify({ items })
});
console.log('HTTP', res.status, await res.text());
