const CACHE = 'tf-v1';
const APP_SHELL = [
  '/app',
  '/theraflow-unified-v3.html',
  '/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Nunca intercepta: API, Supabase, Stripe, PostHog
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('stripe.com') ||
    url.hostname.includes('posthog.com')
  ) return;

  // App shell (.html): cache-first, atualiza em background
  if (APP_SHELL.includes(url.pathname) || url.pathname.endsWith('.html')) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        const fetchPromise = fetch(e.request)
          .then(res => { cache.put(e.request, res.clone()); return res; })
          .catch(() => null);
        return cached || await fetchPromise;
      })
    );
    return;
  }

  // Google Fonts: cache-first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        const res = await fetch(e.request);
        cache.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }
});
