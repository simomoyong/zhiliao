async function render() {
  const s = await chrome.storage.local.get(['lastSync', 'lastAdded', 'lastMessage']);
  const el = document.getElementById('status');
  if (!s.lastSync) {
    el.textContent = '还没有同步过。打开门户通知页，等几秒即可。';
    return;
  }
  const t = new Date(s.lastSync).toLocaleTimeString('zh-CN', { hour12: false });
  el.innerHTML = `上次同步：${t}<br>${s.lastMessage || ''}`;
}

document.getElementById('sync').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/portal\.chd\.edu\.cn/.test(tab.url || '')) {
    document.getElementById('status').textContent = '请先切到校园门户的通知页，再点这里。';
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: 'scan' });
  setTimeout(render, 1200);
});

document.getElementById('open').addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://127.0.0.1:8787/' });
});

render();
