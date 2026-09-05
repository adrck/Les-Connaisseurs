const CACHE_VERSION = "lc-be2bed1c835b";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

// The app shell: everything needed to render every tab of the SPA offline.
// Update CACHE_VERSION above whenever you change files so old caches get replaced.
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/css/style.css",
  "./assets/js/main.js",
  "./assets/js/contact.js",
  "./assets/js/form.js",
  "./assets/js/riders.js",
  "./assets/js/rules.js",
  "./assets/js/standings.js",
  "./assets/js/teams.js",
  "./assets/img/header.jpg",
  "./assets/img/header-logo.jpg",
  "./assets/img/header_recolored.jpg",
  "./assets/img/hero-grand-tours.jpg",
  "./assets/img/home-hero.jpg",
  "./assets/img/icon-192.png",
  "./assets/img/icon-512.png",
  "./pages/home.html",
  "./pages/rules.html",
  "./pages/enter.html",
  "./pages/standings.html",
  "./pages/teams.html",
  "./pages/riders.html",
  "./pages/contact.html"
];

// Data files change during the competition, so they're cached separately
// and refreshed from the network whenever possible (see fetch handler below).
const DATA_FILES = [
  "./data/riders.json",
  "./data/settings.json",
  "./data/state.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") {
    return;
  }

  const isDataFile = DATA_FILES.some((f) => url.pathname.endsWith(f.replace("./", "/")));

  if (isDataFile) {
    // Network-first: standings/riders/settings should be as fresh as possible,
    // but still work offline from the last successful fetch.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for the app shell: instant loads, works offline.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
      );
    })
  );
});
