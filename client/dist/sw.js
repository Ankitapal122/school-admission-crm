// BoardingEdu Enterprise CRM - Progressive Web App Service Worker (v7.0)
const CACHE_NAME = 'boardingedu-crm-shell-v7';
const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/boardingedu-logo.png',
  '/boardingedu-logo-clean.png'
];

function buildReconnectingResponse() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BoardingEdu CRM — Connecting...</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F1F5F9; color: #0F172A; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; box-sizing: border-box; }
    .card { background: #FFFFFF; border-radius: 16px; padding: 32px 28px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08); border: 1px solid #E2E8F0; }
    .spinner { width: 42px; height: 42px; border: 4px solid #DBEAFE; border-top-color: #1D4ED8; border-radius: 50%; margin: 0 auto 18px; animation: spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { margin: 0 0 8px; font-size: 19px; color: #123B70; }
    p { margin: 0 0 18px; font-size: 13.5px; color: #475569; line-height: 1.55; }
    .status { font-size: 12px; font-weight: 700; color: #1D4ED8; background: #EFF6FF; padding: 8px 12px; border-radius: 8px; margin-bottom: 16px; }
    button { background: #1D4ED8; color: #fff; border: none; border-radius: 10px; padding: 10px 20px; font-size: 13.5px; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>BoardingEdu CRM Server Waking Up</h1>
    <p>Server temporarily restart ya wake up ho raha hai. Page automatically load ho jayega — kuch second wait karein.</p>
    <div class="status" id="st">Checking server connection...</div>
    <button onclick="window.location.reload()">Retry Now</button>
  </div>
  <script>
    let tries = 0;
    async function check() {
      tries++;
      document.getElementById('st').textContent = 'Connecting to CRM server (attempt ' + tries + ')...';
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok) {
          document.getElementById('st').textContent = 'Connected! Opening CRM...';
          window.location.reload();
          return;
        }
      } catch (e) {}
      setTimeout(check, 2500);
    }
    setTimeout(check, 1500);
  </script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Install: Cache core app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS).catch((err) => {
        console.warn('[SW] App shell precache error:', err);
      });
    })
  );
});

// Activate: Clean up old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key.startsWith('boardingedu-')) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET or chrome-extension requests
  if (req.method !== 'GET' || url.protocol.startsWith('chrome-extension')) {
    return;
  }

  // Socket.io and real-time streams bypass cache
  if (url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // API calls: Network-first with IndexedDB/offline fallback handled in frontend
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response(
          JSON.stringify({
            success: false,
            offline: true,
            message: 'You are currently offline. Local changes will sync automatically when reconnected.'
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
    return;
  }

  // Static assets (js, css, fonts, images): Cache-first with network fallback
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((networkRes) => {
          if (networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        }).catch(() => caches.match('/'));
      })
    );
    return;
  }

  // Navigation requests: Network-first, fallback to cached /index.html OR branded auto-reconnecting page on 502/503/504
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res.status >= 500) {
            const cachedIndex = await caches.match('/index.html');
            if (cachedIndex) return cachedIndex;
            return buildReconnectingResponse();
          } else if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          }
          return res;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('/index.html');
          return cachedIndex || (await caches.match('/')) || buildReconnectingResponse();
        })
    );
    return;
  }

  // Default: Network with cache fallback
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

// Push Notifications Listener
self.addEventListener('push', (event) => {
  let payload = {
    title: 'BoardingEdu CRM Alert',
    body: 'You have a new admission, lead, or follow-up alert.',
    icon: '/boardingedu-logo.png',
    badge: '/boardingedu-logo.png',
    url: '/'
  };

  try {
    if (event.data) {
      const data = event.data.json();
      payload = { ...payload, ...data };
    }
  } catch (e) {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/boardingedu-logo.png',
    badge: payload.badge || '/boardingedu-logo.png',
    vibrate: [100, 50, 100],
    data: {
      url: payload.url || '/',
      dateOfArrival: Date.now()
    },
    actions: [
      { action: 'open', title: 'Open CRM' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Skip waiting message listener
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
