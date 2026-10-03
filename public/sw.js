// Blockyard's service worker. It has one job: letting phones show a notification, and opening the right
// page when you press it. It does NOT cache or change page loads (there is no "fetch" handler on purpose).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.hash) || '';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = all.find((c) => 'focus' in c);
    if (tab) { await tab.focus(); tab.postMessage({ by: 'open', hash }); return; }
    await self.clients.openWindow(self.registration.scope + hash);
  })());
});
