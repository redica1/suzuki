/* 캠프 일정 찾기 — 「홈 화면에 추가」(앱처럼 쓰기)용 서비스 워커 (11-29)
 * 저장(캐시)은 하지 않아요: 늘 인터넷으로 새 화면을 불러와요. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* 그대로 인터넷으로 */ });
