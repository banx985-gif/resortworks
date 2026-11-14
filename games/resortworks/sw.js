// RESORTWORKS â€” service worker (offline cache for the installed web app).
//
// NETWORK FIRST: when the phone is online it always fetches the newest files
// (so a new build shows up on the next open) and keeps a copy; when offline
// it plays from that copy.
//
// VERSION is stamped automatically by publish.ps1 on every publish. A new
// version makes the phone install this worker fresh and throw away old copies.
//
// This game imports the shared series engine from ../../core/, which sits
// outside this folder. Requests from the game page still pass through this
// worker, so the engine files are cached too.
const VERSION = '20261114-184142';
const CACHE = 'resortworks-' + VERSION;

// The page itself + manifest + icons, so the app opens offline straight away.
const CORE = ['./', './index.html', './manifest.webmanifest', './styles/app.css',
  './assets/branding/pwa/icon-192.png', './assets/branding/pwa/icon-512.png'];
// Every code file (game + shared engine) â€” filled in by publish.ps1 so the whole
// game's code is saved on the very first visit. Art is cached the first time the
// game loads it. (Empty when run locally.)
const PRECACHE = ['./app.js', './styles/app.css', './assets/img_opt/staff/staff_s01.webp', './assets/img_opt/staff/staff_s11.webp', './assets/img_opt/staff/staff_s21.webp', './assets/img_opt/staff/staff_s31.webp', './assets/img_opt/staff/staff_s41.webp', './assets/img_opt/facilities/facility_f01.webp', './assets/img_opt/facilities/facility_f02.webp', './assets/img_opt/facilities/facility_f03.webp', './assets/img_opt/facilities/facility_f04.webp', './assets/img_opt/facilities/facility_f05.webp', './assets/img_opt/facilities/facility_f06.webp', './assets/img_opt/facilities/facility_f07.webp', './assets/img_opt/facilities/facility_f08.webp', './assets/img_opt/rooms/room_rm01.webp', './assets/img_opt/rooms/room_rm02.webp', './assets/img_opt/world/world_guest_adult_a.webp', './assets/img_opt/world/world_staff_frontoffice_base.webp', './assets/img_opt/world/world_staff_housekeeping_base.webp', './assets/img_opt/world/world_staff_hospitality_base.webp', './assets/img_opt/world/world_staff_activities_base.webp', './assets/img_opt/world/world_staff_maintenance_base.webp'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // One file failing must not block the rest.
      .then((c) => Promise.allSettled(CORE.concat(PRECACHE).map((u) =>
        c.add(new Request(u, { cache: 'reload' })))))
      .catch(() => { /* offline during install: runtime caching will fill in */ })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('resortworks-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});

// BIG RUN 6 (notifications, like BOTWORKS M38): a tapped notification (phone browsers show them through this worker)
// brings the game to the front and tells it which screen to open (core/LocalNotify; the app uses the phone's own).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      const page = all[0];
      if (page) {
        page.postMessage({ type: 'notify:open', data });
        return page.focus();
      }
      const open = data.open && data.open.screen ? '?open=' + encodeURIComponent(data.open.screen) + '&slot=' + (data.open.slot | 0) : '';
      return self.clients.openWindow('./index.html' + open);
    })
  );
});
