const CACHE_VERSION = "document-reader-v4";
const APP_CACHE = CACHE_VERSION;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

const REMOTE_LIBRARIES = [
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.js",
  "https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js",
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs",
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs"
];

self.addEventListener("install", function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_SHELL);

    // Die Bibliotheken werden nach Möglichkeit schon bei der Installation
    // gespeichert. Ein CDN-Fehler soll die PWA-Installation nicht verhindern.
    await Promise.allSettled(
      REMOTE_LIBRARIES.map(async function (url) {
        const response = await fetch(url, { mode: "cors" });

        if (response.ok) {
          await cache.put(url, response);
        }
      })
    );

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    const cacheNames = await caches.keys();

    await Promise.all(
      cacheNames
        .filter(function (name) {
          return (
            name.startsWith("document-reader-") &&
            name !== APP_CACHE
          );
        })
        .map(function (name) {
          return caches.delete(name);
        })
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:"
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async function () {
      try {
        const response = await fetch(request);
        const cache = await caches.open(APP_CACHE);

        await cache.put(
          "./index.html",
          response.clone()
        );

        return response;
      } catch (error) {
        return (
          await caches.match("./index.html") ||
          await caches.match("./") ||
          new Response(
            "Die App ist offline noch nicht vollständig gespeichert.",
            {
              status: 503,
              headers: {
                "Content-Type": "text/plain; charset=utf-8"
              }
            }
          )
        );
      }
    })());

    return;
  }

  event.respondWith((async function () {
    const cached = await caches.match(request);

    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(request);

      if (
        response.ok ||
        response.type === "opaque"
      ) {
        const cache = await caches.open(APP_CACHE);

        await cache.put(
          request,
          response.clone()
        );
      }

      return response;
    } catch (error) {
      return new Response("", {
        status: 504,
        statusText: "Offline"
      });
    }
  })());
});