# ReschEdu Frontend

학원 시간표/보강 관리 서비스 프론트엔드. 원장·강사·학부모 세 역할이 같은 앱을 다르게 씀.

- 🔗 백엔드: https://github.com/hyo213/reschedu-back
- 🧱 Next.js 16(App Router, Turbopack) · TypeScript · Tailwind CSS · axios

## 📱 화면 구성

| 화면 | 내용 |
|---|---|
| 정규 수업 | 주간 시간표, 반 편성, 담당 강사 인계 |
| 수강생 관리 | 등록/승인, 수강 기간, 인계 이력 |
| 보강권 관리 | 잔여 보강권, 정책 설정, 수동 지급 |
| 보강 신청/매칭 | 여석 조회, 신청, 원장/강사 직접 매칭 |
| 공지사항 / 마이페이지 | 다학원 자녀 지원(학부모) |
| 실시간 알림 | SSE 토스트 (보강권 발급, 가입 승인 대기) |

## 🛠 Tech Stack

- ⚛️ Next.js 16 (App Router, Turbopack)
- 🔷 TypeScript
- 🎨 Tailwind CSS
- 🌐 axios (전역 인터셉터로 401/403 세션 만료 처리)
- 📡 `EventSource`(SSE)
- 🔐 JWT httpOnly 쿠키 (`withCredentials: true`)

## 🚀 실행 방법

백엔드(`localhost:8080`) 먼저 실행.

```bash
npm install
npm run dev
```

→ `localhost:3000` 접속
