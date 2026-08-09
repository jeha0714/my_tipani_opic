/* 혼티오 문장집 service worker
   - audio: cache-first, 영구 보관 (경로가 /audio/v1/ 로 버전되어 있어 무효화 불필요)
   - shell: network-first(3s timeout) + 캐시 폴백 → 항상 최신, 오프라인에서도 동작
   콘텐츠를 바꿔 배포할 때 SHELL 캐시는 자동 갱신되므로 버전을 올릴 필요가 없다.
   AUDIO 캐시는 /audio/v2/ 처럼 경로를 올릴 때만 아래 상수를 함께 올린다. */
const SHELL = 'opic-shell-v1';
const AUDIO = 'opic-audio-v1';
const KEEP = [SHELL, AUDIO];
const NET_TIMEOUT = 3000;

const SHELL_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-180.png',
  '/icons/icon-512.png',
  '/icons/icon-32.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      // addAll 은 하나라도 실패하면 전체가 실패하므로 개별 add 로 처리한다
      .then(c => Promise.all(SHELL_URLS.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/audio/v1/')) {
    e.respondWith(cacheFirst(req, AUDIO));
    return;
  }
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json') {
    e.respondWith(cacheFirst(req, SHELL));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(shell(req));
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

/* 해시 라우팅 SPA 라 모든 navigation 이 같은 문서로 귀결된다 → 캐시 키를 '/' 로 통일 */
async function shell(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await withTimeout(fetch(req), NET_TIMEOUT);
    if (res && res.status === 200 && res.type === 'basic') cache.put('/', res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match('/');
    return hit || new Response('오프라인 상태입니다. 네트워크에 한 번 연결하면 이후에는 오프라인에서도 열립니다.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}
