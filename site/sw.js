/* 小满 PWA：只缓存外壳，行情/对话接口一律直连网络 */
const CACHE = 'xiaoman-shell-v5';
const SHELL = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 接口/鉴权/云函数一律网络优先，不缓存
  if (url.pathname.startsWith('/api') || /callFn|analyze|summary|quote|tts|asr/i.test(url.pathname + url.search)) return;
  if (url.origin !== location.origin) return;

  const isShell = url.pathname === '/' || url.pathname.endsWith('/index.html') ||
    url.pathname === '/manifest.json' || url.pathname.startsWith('/icons/');
  if (isShell) {
    const isHtml = url.pathname === '/' || url.pathname.endsWith('/index.html');
    if (isHtml) {
      e.respondWith(
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html')))
      );
    } else {
      e.respondWith(
        caches.match(req).then((hit) => hit || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => null))
      );
    }
  }
});
