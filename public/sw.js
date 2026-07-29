// Minimal service worker whose only job is to make the app installable
// (Chrome/Android's "Add to Home Screen" prompt requires a registered
// service worker in addition to the manifest + icons). It deliberately has
// no `fetch` handler — every request still goes straight to the network,
// exactly like without a service worker. This is a live, Supabase/Anthropic-
// backed app; caching responses here would risk serving stale session data,
// which is worse than the installability feature is worth. If real offline
// support is ever wanted, that's a deliberate later decision, not something
// to bolt onto this file.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
