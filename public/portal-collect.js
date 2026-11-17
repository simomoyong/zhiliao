/* 在校园门户「通知公告」页面按 F12 → Console，粘贴本文件全部内容后回车。
   作用：把当前页看到的通知标题、日期、部门收集起来，发到本机的知了服务。
   不会读取任何账号信息，也不改门户数据。 */
(async () => {
  const NOISE = /首页|登录|退出|更多|上一页|下一页|尾页|版权所有|技术支持|返回|搜索|全部|展开|收起/;
  const DATE = /(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})|(\d{1,2}[-/.]\d{1,2})/;
  const DEPTS = /(教务处|学生处|学工部|团委|就业|研究生院|图书馆|后勤|保卫|档案馆|宣传部|国际处|财务处|实验室|信息|学院)/;

  const found = new Map();

  function add(title, url, ctx) {
    title = (title || '').replace(/\s+/g, ' ').trim();
    if (title.length < 8 || title.length > 120) return;
    if (NOISE.test(title)) return;
    if (!/关于|通知|公告|公示|报名|申报|评选|讲座|招聘|活动/.test(title)) return;
    if (found.has(title)) return;
    const d = (ctx || '').match(DATE);
    const dept = (ctx || '').match(DEPTS);
    found.set(title, {
      title,
      url: url ? new URL(url, location.href).href : '',
      date: d ? d[0].replace(/[/.]/g, '-') : '',
      department: dept ? dept[0] : '校园门户'
    });
  }

  function scan(doc) {
    doc.querySelectorAll('a').forEach((a) => {
      const ctx = (a.closest('li,tr,div') || a).innerText || '';
      add(a.innerText, a.href, ctx);
    });
    doc.querySelectorAll('li,tr,div').forEach((el) => {
      const t = (el.innerText || '').trim();
      if (!t || t.length < 8 || t.length > 160) return;
      const first = t.split('\n')[0];
      if (!/^【?关于|^通知|^公告|^公示/.test(first)) return;
      add(first, '', t);
    });
  }

  scan(document);
  for (const f of document.querySelectorAll('iframe')) {
    try { if (f.contentDocument) scan(f.contentDocument); } catch (e) {}
  }

  const items = [...found.values()];
  console.log(`找到 ${items.length} 条，前 8 条预览：`);
  console.table(items.slice(0, 8).map((x) => ({ 标题: x.title.slice(0, 40), 日期: x.date, 部门: x.department })));

  if (!items.length) {
    console.warn('没找到条目。请确认：①已登录；②页面已加载出通知列表；③先在页面上点一次“加载更多”。');
    return;
  }
  if (!confirm(`找到 ${items.length} 条，发送到本机知了（127.0.0.1:8787）？`)) return;

  const res = await fetch('http://127.0.0.1:8787/api/import/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  });
  const r = await res.json();
  console.log('导入结果：', r);
  alert(`导入完成：新增 ${r.added} 条，跳过 ${r.skipped} 条`);
})();
