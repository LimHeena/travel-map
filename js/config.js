// ─────────────────────────────────────────────────────────────
//  앱 설정 — Supabase 프로젝트를 만든 뒤 아래 두 값을 채워 넣으세요.
//  (Supabase 사이트 → Project Settings → API 에서 복사)
//  두 값이 비어 있으면 '체험 모드'로 실행되고, 기록은 이 기기에만 저장돼요.
// ─────────────────────────────────────────────────────────────
window.APP_CONFIG = {
  SUPABASE_URL: "https://lfzdlackuqyhvkyvnmbl.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_grQYZDEQeLVTHv0sVAXj1w_zhc2pOkf",
  APP_NAME: "우리 여행지도",
  STORAGE_LIMIT_MB: 1024,  // 무료 요금제 사진 저장 공간 (용량 표시에 사용)
  // 발자취 선 색 — 사람별 이름과 색 (이름·색은 원하는 대로 바꿔도 돼요)
  // key는 이메일을 암호처럼 바꾼 값이라, 공개된 코드에 이메일이 드러나지 않아요.
  WALKERS: [
    { key: "4ee19715cc", name: "Heena", color: "#6f7dfb" },
    { key: "f99f133045", name: "친구", color: "#ff6f9f" },
  ],
  TOGETHER: { name: "함께", color: "#b36be6" },
};
