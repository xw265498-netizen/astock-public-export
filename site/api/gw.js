const BASE = 'https://early-bovid-d6g90jqkt134e23d0.api.tcloudbasegateway.com/';

function rawBody(req) {
  if (req.body != null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return req.body;
    return JSON.stringify(req.body);
  }
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const p = req.query && req.query.p;
  if (!p) { res.status(400).json({ error: 'missing p' }); return; }
  let path = String(p);
  try { path = decodeURIComponent(path); } catch (e) {}
  const target = BASE + path.replace(/^\/+/, '');
  const headers = { ...req.headers };
  delete headers.host; delete headers.connection; delete headers['content-length'];
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') body = await rawBody(req);
  try {
    const r = await fetch(target, { method: req.method, headers, body, redirect: 'follow' });
    res.status(r.status);
    r.headers.forEach((v, k) => {
      if (['content-encoding','transfer-encoding','connection','content-length','set-cookie'].includes(k)) return;
      try { res.setHeader(k, v); } catch (e) {}
    });
    if (r.body && r.body.getReader) {
      const reader = r.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } else {
      const text = await r.text();
      res.send(text);
    }
  } catch (e) {
    res.status(502).json({ error: 'gateway proxy failed', detail: String(e && e.message || e) });
  }
};

module.exports.config = { maxDuration: 60 };
