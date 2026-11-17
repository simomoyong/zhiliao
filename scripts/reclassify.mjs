import { db } from '../lib/db.mjs';
import { classify } from '../lib/ai.mjs';

const rows = db.prepare("SELECT id, title, body, category FROM items WHERE ext_id NOT LIKE 'seed-%'").all();
let changed = 0;
const stmt = db.prepare('UPDATE items SET category = ? WHERE id = ?');
for (const r of rows) {
  const cat = classify(r.title, r.body || '');
  if (cat !== r.category) { stmt.run(cat, r.id); changed++; console.log(`${r.category} → ${cat}  ${r.title.slice(0, 30)}`); }
}
console.log(`共更新 ${changed} 条`);
