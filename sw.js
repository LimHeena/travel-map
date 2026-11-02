// 앱 화면 파일을 폰에 저장해 두어 빠르게 열리게 해요. (기록·사진은 서버에서 가져와요)
// 앱 파일을 수정했다면 아래 버전 숫자를 올려 주세요.
const VERSION = "v3";
const SHELL = [
  "./", "index.html", "css/style.css", "manifest.json",
  "js/config.js", "js/image.js", "js/stores.js", "js/app.js",
  "vendor/supabase.js", "vendor/jszip.min.js",
  "data/kr.json", "data/world.json", "data/seoul.json", "icons/icon-192.png",
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 새 버전이 있으면 받아오고, 인터넷이 없으면 저장된 화면을 보여줘요.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
