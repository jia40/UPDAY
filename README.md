# Upday

매일의 나를 업데이트하는 개발자 성장 관리 서비스입니다. 오늘 할 일, 학습 기록, 면접 복습과 취업 지원 과정을 한곳에서 관리합니다.

이 문서의 완료 표시는 저장소 코드 기준입니다. 운영 Firebase 규칙·인덱스·메일 설정과 배포 상태는 별도로 확인해야 합니다.

## 주요 기능

| 화면 | 구현된 기능 |
| --- | --- |
| Dashboard | 오늘 할 일 완료 현황, 연속 학습일, 면접 복습 대상 수, 지원·서류·면접 집계 |
| Today | 오늘 할 일 CRUD·완료율, 과거 날짜 조회·미완료 선택 이월, 선택 날짜의 Study 학습 시간 합계 |
| Study | 학습 기록 CRUD·학습일·태그, 날짜/태그 필터, 학습 잔디 기간·연도 선택, 주간·월간 통계, 20개씩 더 보기 |
| Interview | 질문·선택 답변·태그 CRUD, 이해 상태·복습 완료, 상태/태그/복습 필터, 질문 목록 20개씩 더 보기 |
| Job | 기업·포지션·공고 URL·지원일·메모 CRUD, 지원 상태 변경·필터 |
| 마이페이지 | 이름·이메일·가입일 조회, 이름 수정·취소·재시도 |
| 인증·공통 | 이메일 회원가입·로그인·로그아웃·비밀번호 재설정 메일 요청, 인증 경로 보호, 페이지 지연 로딩·실패 복구 |

Today는 시간을 직접 입력하는 화면이 아니라 Study 기록을 합산하는 화면입니다. **오늘의 한 줄 기록, 타이머, Google 로그인 연결, 회원 탈퇴는 현재 미구현**입니다.

Study·Interview·Job 작성 폼과 마이페이지 이름 수정은 변경 사항이 있을 때 내부 이동·로그아웃을 확인하고, 새로고침에는 브라우저 기본 경고를 연결합니다. 자동 임시 저장은 제공하지 않습니다.

## 시작하기

### 준비 사항

- Node.js 24.x의 24.15.0 이상 및 npm. 현재 로컬 확인 환경은 Node.js 24.19.0입니다. 설치된 Vite와 테스트용 jsdom의 요구 조건을 함께 만족하는 버전을 사용합니다.
- Firebase 프로젝트의 Authentication 이메일/비밀번호 제공업체와 Cloud Firestore 설정
- 보안 규칙·인덱스·기존 데이터 준비: [Firebase 운영 및 배포](docs/operations.md)

저장소 루트에서 실행합니다.

```powershell
npm ci
```

루트에 `.env.local`을 만들고 Firebase 프로젝트의 웹 앱 설정을 입력합니다. 아래는 변수 이름과 자리표시자이며 실제 설정값이 아닙니다.

```dotenv
VITE_FIREBASE_API_KEY=your-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-web-app-id
```

`src/lib/firebase.ts`가 위 여섯 변수를 읽습니다. `.env.local`은 Git 제외 대상입니다. 서비스 계정 키나 관리용 토큰을 `VITE_` 변수에 넣지 마세요. 웹 클라이언트에 포함되는 설정과 데이터 접근을 제한하는 보안 규칙은 별개입니다.

```powershell
npm run dev
```

터미널에 표시된 로컬 URL을 엽니다. 환경 변수 변경 후에는 개발 서버를 다시 시작합니다.

### 실행 명령

| 명령 | 용도 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | TypeScript 검사와 프로덕션 빌드, 결과는 `dist/` |
| `npm run preview` | 빌드된 화면 로컬 확인. 먼저 build 실행 |
| `npm run lint` | ESLint 검사 |
| `npm run analyze:bundle -- current --check` | 프로덕션 JS 의존 그래프·파일 크기 분석, 공개 인증 경로의 Firestore 포함 여부 검사 |
| `npm test` | 일반 자동 테스트. 에뮬레이터 전용 테스트는 기본적으로 건너뜀 |
| `npm run test:rules` | Java 21 이상과 Firebase CLI/에뮬레이터로 보안 규칙 테스트 |

테스트의 범위와 실제 계정 확인 절차는 [검증 가이드](docs/testing.md)를 참고하세요.

## 화면 경로

| 경로 | 동작 |
| --- | --- |
| `/`, `/login` | 로그인. 로그인 상태로 진입하면 대시보드로 이동 |
| `/signup` | 회원가입. 이름 저장·로그아웃 완료 후 로그인 화면으로 이동 |
| `/reset-password` | 로그인 없이도 재설정 메일 요청 가능 |
| `/dashboard` | 본인 현황 집계 |
| `/today` | 날짜 선택으로 할 일·학습 시간 조회 |
| `/study` | 학습 목록·잔디·통계 |
| `/study?date=YYYY-MM-DD` | 해당 날짜의 학습 목록 |
| `/study?new=1&date=YYYY-MM-DD` | 해당 학습일을 기본값으로 새 기록 작성 |
| `/study?record=<id>` / `&edit=1` | 학습 상세 / 수정 |
| `/interview?new=1` | 새 면접 질문 작성 |
| `/interview?question=<id>` / `&edit=1` | 면접 질문 상세 / 수정 |
| `/job?new=1` | 새 지원 기록 작성 |
| `/job?application=<id>` / `&edit=1` | 지원 기록 상세 / 수정 |
| `/mypage` | 계정 정보·이름 수정 |

상세 URL 뒤의 `&edit=1`은 같은 URL에 덧붙입니다. 대시보드 이하 기능 화면은 로그인이 필요합니다. 알 수 없는 경로는 없는 페이지 안내를 표시합니다.

## 집계 기준

- **Today 학습 시간:** 선택한 날짜와 `studyDate`가 일치하는 본인 기록의 분 합계. 별도 시간 데이터를 저장하지 않습니다.
- **Study 통계:** 학습일 기준. 주간은 월요일~일요일, 월간은 이번 달의 경우 오늘까지·과거 월은 말일까지입니다. 같은 날 여러 기록의 시간·개수는 합산하고 학습일 수는 중복 제거합니다. 목록 필터는 주간·월간 통계에 영향을 주지 않습니다.
- **연속 학습일:** 오늘 학습했으면 오늘부터, 아직 학습하지 않았으면 어제부터 연속된 학습일을 계산합니다.
- **면접 복습:** 설명 가능 상태를 제외하고, 미복습 또는 마지막 복습일로부터 로컬 달력 날짜 기준 7일 이상 지난 질문입니다. 목록과 대시보드가 같은 판별 함수를 사용합니다.
- **Job 지원 수:** 지원 완료·서류·코딩테스트·면접·합격·탈락의 합계입니다. 관심·지원 예정은 제외합니다. 서류·면접은 현재 각각 해당 상태인 기록 수입니다.

일자 표시는 사용자 로컬 날짜를 기준으로 합니다. 이전 Study 날짜 없는 기록의 호환성과 보완 절차는 [운영 문서](docs/operations.md)에 있습니다.

Study 목록은 날짜 없는 기존 기록도 생성일의 로컬 날짜를 기준으로 표시합니다. Today 학습 시간에 포함하려면 해당 기록의 실제 학습 날짜를 저장하거나 운영 문서의 날짜 보완 절차를 진행해야 합니다.

## 구조와 조회 비용

React·TypeScript·Vite, Firebase Authentication·Cloud Firestore를 사용합니다. Vercel용 SPA rewrite는 `vercel.json`에 있습니다.

- `AuthProvider`가 인증 구독 하나를 관리하고 `useAuth`로 상태를 공유합니다.
- Study는 Firestore 스냅샷 커서, Interview는 전체 메타데이터에서 정렬한 문서 ID 커서로 20개씩 목록을 조회합니다.
- Study 전체 메타데이터는 UID별 **60초 메모리 캐시**와 진행 중 요청 공유를 사용합니다. 기록 변경 후 무효화하고 수동 새로고침·오류 재시도는 캐시를 우회합니다.
- 캐시는 현재 페이지 수명에 한정됩니다. 전체 새로고침·일반 링크에 의한 문서 이동 시 초기화됩니다. 다른 탭·기기의 변경은 만료 후 갱신 이벤트 또는 수동 새로고침으로 반영됩니다.
- 페이지네이션과 필드 선택은 전체 통계 조회의 문서 읽기 비용을 없애지 않습니다. 최초 통계 읽기는 여전히 전체 사용자 기록 수에 비례합니다.

[데이터 구조·조회 정책](docs/architecture.md)에 컬렉션 필드, 입력 제한, 캐시 및 페이지네이션의 제약을 정리했습니다.

## 로드맵

### 구현 완료

- [x] 이메일 인증·비밀번호 재설정 요청·인증 Provider 통합
- [x] Todo CRUD·과거 조회·선택 이월·완료율·저장 응답 실패 복구
- [x] Study CRUD·날짜/태그 필터·학습 잔디·연속 학습일
- [x] 주간·월간 통계·Today 학습 시간 연동
- [x] Interview CRUD·이해 상태·복습·필터·페이지네이션
- [x] Job CRUD·지원 상태 필터·대시보드 집계
- [x] 마이페이지 조회·이름 수정
- [x] 작성 중 이탈 보호·공통 모달·로딩/오류/빈 목록 안내
- [x] 페이지별 지연 로딩·실패 복구·브라우저 탭 제목
- [x] Study 통계 캐시·중복 요청 병합
- [x] 로컬 보안 규칙·인덱스 파일과 일반/규칙 테스트 작성
- [x] 반응형 스타일·날짜 입력 라벨 등 접근성 개선 적용

완료 표시는 전체 화면·기기의 수동 검증 완료나 운영 설정 적용을 의미하지 않습니다.

### 남은 작업

- [ ] Today 날짜별 한 줄 기록
- [x] 인증/Firestore 모듈 분리·공개 경로 JS 전송량 개선 및 번들 회귀 검사
- [ ] 실제 브라우저·배포 환경의 로딩 시간 측정 및 추가 최적화
- [ ] 실제 브라우저·모바일·키보드·스크린 리더 검증 확대
- [ ] Skeleton UI·Toast
- [ ] Google 로그인 연결
- [ ] 이메일/비밀번호 변경·회원 탈퇴·프로필 이미지
- [ ] 면접 자동 알림·개인별 복습 주기
- [ ] 월간 목표·전월 비교·통계 내보내기
- [ ] 채용 공고 자동 수집·알림·첨부파일

## 개발 흐름

`main`에서 작업 브랜치를 만들고 Issue → 구현·검증 → PR → 리뷰·Preview 확인 → main 병합 순서로 진행합니다. 프로젝트 템플릿의 브랜치 예시는 다음과 같습니다.

```text
feature-study-monthly-stats#81
fix-today-date-accessibility#72
refactor-study-stats-cache#78
docs-common-readme#83
```

[이슈 템플릿](.github/ISSUE_TEMPLATE/issue.md)과 [PR 템플릿](.github/PULL_REQUEST_TEMPLATE.md)을 사용합니다. 커밋은 변경 유형·내용·이슈 번호가 드러나도록 작성합니다.

```text
[FEATURE] 월간 학습 요약 통계 구현 #81
[FIX] Today 날짜 선택 입력의 접근성 개선 #72
[DOCS] README 및 로드맵 현행화 #83
```

마지막 문서 확인일: 2026-10-29

번들 측정 조건·변경 전후 결과와 실제 브라우저 확인 절차는 [로딩 성능 분석](docs/performance.md)을 참고하세요.
