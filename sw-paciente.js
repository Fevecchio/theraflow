// Service worker do PORTAL DO PACIENTE — offline como FALLBACK, nunca como fonte.
// Estratégia: network-first SEMPRE (com rede boa nunca serve arquivo velho — o
// cache de 1h do browser já causou bug real de "testar código antigo"; aqui o
// cache só responde quando a rede falha). Atuação restrita por lista: shell do
// portal + seus js/css/ícone. /api/, Supabase, fontes e o app do terapeuta
// passam direto (sem respondWith) — o SW é invisível para eles.
var CACHE = 'tf-pac-v1';
var SHELL = [
  '/paciente.html', '/app.css', '/manifest-paciente.json', '/icons/pac-icon.svg',
  '/js/00-globals.js', '/js/01-utils.js', '/js/02-ui.js', '/js/03-sync.js',
  '/js/04-auth.js', '/js/06-patients.js', '/js/13-portal.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys
        .filter(function (k) { return k.indexOf('tf-pac-') === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;
  var isNav = req.mode === 'navigate' && (url.pathname === '/paciente' || url.pathname === '/paciente.html');
  var isShell = SHELL.indexOf(url.pathname) !== -1;
  if (!isNav && !isShell) return; // resto do site não passa pelo SW
  var key = isNav ? '/paciente.html' : url.pathname;
  e.respondWith(
    fetch(req).then(function (resp) {
      if (resp && resp.ok) {
        var clone = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(key, clone); });
      }
      return resp;
    }).catch(function () {
      return caches.match(key).then(function (hit) {
        return hit || new Response('Sem conexão — abra novamente quando a internet voltar.',
          { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      });
    })
  );
});
