/* 在页面主世界运行：拦截 fetch / XHR，记录活动相关响应，供扩展读取 */
(() => {
  if (window.__qczdHooked) return;
  window.__qczdHooked = true;

  const KEY = /(activity|credit|score|活动|学分)/i;
  const store = [];

  function push(url, text) {
    if (!text || typeof text !== 'string') return;
    if (text.length > 200000) return;
    if (!KEY.test(url) && !/学分|活动名称|credit/i.test(text)) return;
    store.push({ url: String(url).slice(0, 300), sample: text.slice(0, 6000) });
    if (store.length > 6) store.shift();
  }

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = async function (...args) {
      const res = await origFetch.apply(this, args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        res.clone().text().then((t) => push(url, t)).catch(() => {});
      } catch (e) {}
      return res;
    };
  }

  const oOpen = XMLHttpRequest.prototype.open;
  const oSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return oOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', () => {
      try { push(this.__u || '', this.responseText); } catch (e) {}
    });
    return oSend.apply(this, arguments);
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.type !== 'qczd-dump') return;
    window.postMessage({ type: 'qczd-dump-result', data: store.slice(-4) }, '*');
  });
})();
