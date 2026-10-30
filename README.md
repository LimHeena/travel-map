# 우리 여행지도

둘이 함께 쓰는 여행 사진 지도 앱이에요. 국내(시·군 단위)·세계(나라 단위) 지도를 만들고, 지역을 눌러 날짜·메모·사진을 남기면 그 지역이 사진으로 채워져요.

## 구성
- `index.html`, `css/`, `js/` — 앱 화면 (아이폰·갤럭시 브라우저에서 "홈 화면에 추가"로 설치)
- `js/config.js` — Supabase 주소와 키를 넣는 곳. 비워 두면 체험 모드(이 기기에만 저장)
- `supabase/setup.sql` — Supabase에 표·보안 규칙·사진 저장소를 만드는 SQL
- `.github/workflows/keepalive.yml` — 3일마다 서버를 깨워서 무료 프로젝트 일시정지를 막아요
- `data/` — 지도 모양 (국내: 통계청 시군구 경계 기반, 세계: Natural Earth)

## 설치 순서 (요약)
1. Supabase 가입 → 새 프로젝트 → SQL Editor에서 `supabase/setup.sql` 실행 (멤버 이메일 2개 수정 후)
2. Authentication → Sign In / Providers → Email: "Confirm email" 끄기
3. Project Settings → API의 URL과 anon(또는 publishable) 키를 `js/config.js`에 붙여넣기
4. GitHub에 공개 저장소를 만들고 이 폴더 전체 업로드 → Settings → Pages → main 브랜치로 공개
5. 두 사람 모두 앱 주소에서 "처음이에요(가입하기)" → 가입이 끝나면 Supabase에서 새 가입 막기 (Allow new users to sign up 끄기)
6. (선택) GitHub 저장소 Secrets에 SUPABASE_URL, SUPABASE_ANON_KEY 등록 → 자동 깨우기 작동

## 참고
- 사진은 올릴 때 기록용(약 0.3MB)과 미리보기용(약 40KB)으로 줄여 저장돼요.
- 설정 탭의 "백업 파일 만들기"로 모든 기록·사진을 ZIP으로 받아둘 수 있고, "되살리기"로 복원할 수 있어요.
- anon 키는 공개돼도 괜찮게 설계된 키예요. 데이터는 멤버 이메일로 로그인한 사람만 볼 수 있어요.
- GitHub는 저장소에 60일 동안 변경이 없으면 자동 실행을 멈출 수 있어요. 그때는 Actions 탭에서 다시 켜 주세요.
- 앱 파일을 고친 뒤에는 `sw.js`의 VERSION 숫자를 올려야 폰에 새 버전이 반영돼요.
