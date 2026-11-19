import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.join(process.cwd(), 'data');
fs.mkdirSync(DATA, { recursive: true });

let keys = null;

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function ensureVapid() {
  if (keys) return keys;
  const file = path.join(DATA, 'vapid.json');
  if (fs.existsSync(file)) {
    try { keys = JSON.parse(fs.readFileSync(file, 'utf8')); return keys; } catch (e) {}
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  const raw = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(pub.x, 'base64'),
    Buffer.from(pub.y, 'base64')
  ]);
  keys = {
    publicKey: b64url(raw),
    privateJwk: priv,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(file, JSON.stringify(keys, null, 1));
  return keys;
}

export function publicKey() {
  return ensureVapid().publicKey;
}

function signJwt(audience) {
  const { privateJwk } = ensureVapid();
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64url(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:smm2002026@qq.com'
  }));
  const data = `${header}.${payload}`;
  const key = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
  return `${data}.${b64url(sig)}`;
}

/**
 * 发送一条“空载荷”推送。Service Worker 收到后自己去 /api/items 取内容再弹通知。
 * 空载荷不需要 RFC8291 加密，兼容性最好。
 */
export async function sendPush(sub) {
  if (!sub || !sub.endpoint) return { ok: false, error: 'no endpoint' };
  const aud = new URL(sub.endpoint).origin;
  const jwt = signJwt(aud);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  let res;
  try {
    res = await fetch(sub.endpoint, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        Authorization: `vapid t=${jwt}, k=${publicKey()}`,
        TTL: '86400',
        Urgency: 'normal'
      }
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res || !res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: text.slice(0, 200) };
  }
  return { ok: true, status: res.status };
}
