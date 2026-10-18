// Retirement worker at the original URL for returning installed apps.
// The old Rena worker had no fetch handler or caches. Leave all storage untouched.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  try { await self.clients.claim(); }
  finally { await self.registration.unregister(); }
})()));
