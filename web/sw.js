// オフライン対応。アプリ本体(シェル+問題データ)をキャッシュする。
// Firebase(gstatic)や Firestore へのリクエストはキャッシュせずネット経由。
const CACHE = 'spiral-grammar-v5';
const ASSETS = [
  './',
  './index.html',
  './teacher.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './sounds/correct.mp3',
  './sounds/wrong.mp3',
  './sounds/levelup.mp3',
  './data/questions.json',
  './data/categories.json',
  './js/app.js',
  './js/ui.js',
  './js/theme.js',
  './js/data.js',
  './js/store.js',
  './js/streak.js',
  './js/state.js',
  './js/cloud.js',
  './js/fx.js',
  './js/helpui.js',
  './js/teacher.js',
  './js/screens/home.js',
  './js/screens/quiz.js',
  './js/screens/trail.js',
  './js/screens/settings.js',
  './js/screens/leaderboard.js',
  './js/screens/more.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

// HTML/JS/CSS は「ネット優先」= 更新を即反映(オフライン時のみキャッシュ)。
// 問題データ・音声・画像など大きく変わりにくいものは「キャッシュ優先」。
function isStaticAsset(pathname) {
  return (
    pathname.includes('/data/') ||
    pathname.includes('/sounds/') ||
    pathname.includes('/icons/') ||
    pathname.endsWith('.json') ||
    pathname.endsWith('.mp3') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.webmanifest')
  );
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 同一オリジンのみキャッシュ対象(Firebase等はそのままネットへ)
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== 'GET') return;

  if (isStaticAsset(url.pathname)) {
    // キャッシュ優先(なければ取得してキャッシュ)
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        }),
      ),
    );
    return;
  }

  // ネット優先。HTTPキャッシュも回避(no-store)して常に最新を取得。
  // 失敗時(オフライン)のみキャッシュへフォールバック。
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
