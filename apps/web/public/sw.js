/* hakomokuroku SW - minimal offline + runtime caching */
const VERSION = 'v1-20251001';
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const IMAGE_CACHE = `images-${VERSION}`;

const PRECACHE_URLS = [
  '/',                          // アプリシェル
  '/manifest.webmanifest',
  '/offline.html',              // オフラインフォールバック
  '/labels/new',                // 単票ラベル作成
  '/scan',                      // QRスキャン
  '/boxes',                     // 箱一覧（IndexedDB 参照）
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(PRECACHE_URLS.map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(n => {
      if (![STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(n)) {
        return caches.delete(n);
      }
    }));
    await self.clients.claim();
  })());
});

/** ユーティリティ */
const isHTMLNavigation = (req) =>
  req.mode === 'navigate' ||
  (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));

const sameOrigin = (url) => self.location.origin === url.origin;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) ナビゲーションは「ネットワーク優先＋オフラインフォールバック」
  if (isHTMLNavigation(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        // 成功したら静的キャッシュを更新（任意）
        const cache = await caches.open(STATIC_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        // 既存ページ or offline.html にフォールバック
        const cached = await cache.match(req)
                     || await cache.match('/')              // まずアプリシェルにフォールバック
                     || await cache.match('/offline.html'); // 最後にオフラインページ
        return cached || new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  // 2) 同一オリジンの JS/CSS/フォントは「Stale-While-Revalidate」
  if (sameOrigin(url) && /\.(?:js|css|woff2?)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const fetchAndPut = fetch(req).then(res => {
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fetchAndPut;
    })());
    return;
  }

  // 3) 画像は「Cache First（上限なしの簡易版）」※必要なら上限管理を追加
  if (sameOrigin(url) && /\.(?:png|jpg|jpeg|gif|webp|avif|svg)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      } catch {
        return new Response(null, { status: 504 });
      }
    })());
    return;
  }

  // 4) それ以外は素通し
});
