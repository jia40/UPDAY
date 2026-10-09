# Upday

## Interview 수정 및 복습 상태 관리

- 상세 화면에서 질문·답변·태그 수정, 삭제, 이해 상태 변경, 복습 완료를 지원합니다.
- 이해 상태는 `unknown`(모름), `learning`(이해 중), `explainable`(설명 가능)이며 복습 시 `lastReviewedAt`에 서버 시각을 저장합니다.
- 수정은 소유자와 최초 생성 시각을 유지합니다. 삭제 전 확인하고, 실패 시 입력 또는 상세 화면에서 재시도할 수 있습니다.
- 새 기능 사용 전 대상 Firebase 프로젝트의 기존 규칙과 `firestore.rules`를 비교하고 Interview 변경을 적용해야 합니다. 로컬 수정만으로 원격 규칙은 변경되지 않습니다.
- `npm run test:rules`에 Interview 접근·수정·삭제·복습 시각 검증을 포함합니다. Java 21 이상과 Firestore 에뮬레이터가 필요합니다.

> **매일의 나를 업데이트하는 개발자 성장 관리 서비스**

Upday는 개발자의 **학습 기록, 취업 준비, 면접 복습, 일일 할 일**을 한곳에서 관리하며
하루하루의 성장 과정을 기록할 수 있도록 돕는 개인 성장 대시보드입니다.

---

## ✨ 주요 기능

### ✅ Today

* 오늘의 할 일 등록 및 완료 처리
* 일일 학습 시간 기록
* 오늘의 한 줄 기록
* 하루 진행률 확인

### 📚 Study

* 학습 기록 작성 / 수정 / 삭제
* React, JavaScript, TypeScript, CS 등 태그 관리
* 일별 학습 시간 기록
* 연속 학습일 확인
* GitHub 스타일 학습 잔디

### 🧠 Interview

* 면접 질문 및 답변 저장
* 질문별 이해 상태 관리

  * 모름
  * 이해 중
  * 설명 가능
* 마지막 복습일 기록
* 복습이 필요한 질문 모아보기

### 💼 Job

* 관심 기업 및 채용 공고 관리
* 지원 상태 관리

```text
관심
→ 지원 예정
→ 지원 완료
→ 서류
→ 코딩테스트
→ 면접
→ 합격 / 탈락
```

---

## 🏠 Dashboard

홈에서는 오늘의 성장 현황을 한눈에 확인할 수 있습니다.

```text
UPDAY

TODAY
오늘 할 일  3 / 4

STUDY
🔥 14일 연속 학습

JOB
지원 12
서류 4
면접 2

INTERVIEW
오늘 복습할 질문 8개
```

---

## 🛠 Tech Stack

### Frontend

* React
* TypeScript
* Vite

### Backend / Database

* Firebase Authentication
* Cloud Firestore

### Deploy

* Vercel

---

## 🗂 Firebase Data Structure

초기 버전에서는 아래와 같은 구조로 시작합니다.

```text
users
 └ userId

todos
 └ todoId
     ├ userId
     ├ title
     ├ completed
     └ date

studyLogs
 └ logId
     ├ userId
     ├ title
     ├ content
     ├ tags
     ├ studyMinutes
     └ createdAt

interviewQuestions
 └ questionId
     ├ userId
     ├ question
     ├ answer
     ├ status
     ├ tags
     └ lastReviewedAt

applications
 └ applicationId
     ├ userId
     ├ company
     ├ position
     ├ url
     ├ status
     └ appliedAt
```

---

## 🌿 Branch Strategy

개인 프로젝트이므로 별도의 `develop` 브랜치 없이
`main + feature branch` 구조로 관리합니다.

```text
feature/*
    ↓
   PR
    ↓
  main
    ↓
 Vercel
```

### Branch Naming

```text
feature/firebase-auth
feature/study-log
feature/interview
feature/job-dashboard

fix/login-redirect
fix/todo-date

refactor/auth-hook
docs/readme
```

---

## 🔄 Workflow

```text
Issue 생성
   ↓
Feature Branch 생성
   ↓
개발 및 Commit
   ↓
Pull Request
   ↓
Vercel Preview 확인
   ↓
Self Review
   ↓
main Merge
   ↓
Production Deploy
```

---

## 💬 Commit Convention

| Type       | 설명          |
| ---------- | ----------- |
| `feature`  | 새로운 기능 추가   |
| `fix`      | 버그 수정       |
| `refactor` | 코드 구조 개선    |
| `style`    | UI 및 스타일 수정 |
| `docs`     | 문서 수정       |

### Example

```text
feature: 비밀번호 재설정 기능 구현
feature: 학습 기록 등록 기능 추가
fix: 로그인 실패 시 에러 처리
refactor: 인증 상태 로직을 useAuth로 분리
docs: README 프로젝트 소개 추가
```

---

## 🚀 Roadmap

### Phase 1 — MVP

* [ ] Firebase 연결
* [ ] 인증 상태 관리
* [ ] Todo CRUD
* [ ] Study Log CRUD
* [ ] Interview CRUD
* [ ] Job Application CRUD
* [ ] Dashboard 구현

### Phase 2 — Growth

* [x] 학습 태그 필터
* [ ] 학습 시간 통계
* [ ] 학습 잔디
* [ ] 연속 학습일 계산
* [ ] 면접 질문 복습 기능
* [ ] 지원 상태 필터
* [ ] 주간 / 월간 통계

### Phase 3 — UX & Quality

* [ ] Loading / Error / Empty State 정리
* [ ] Skeleton UI
* [ ] Toast
* [ ] 반응형 UI
* [ ] 접근성 개선
* [ ] Firebase Security Rules 정리
* [ ] 테스트 코드 추가
* [ ] 성능 최적화

---

## 🎯 Project Goal

Upday는 빠르게 완성하는 것보다
**매일 작은 기능을 추가하고, 직접 발생한 문제를 해결하며 성장하는 것**을 목표로 합니다.

처음부터 많은 라이브러리를 사용하는 대신 React와 Firebase의 기본 기능으로 시작하고,
실제 불편함과 필요가 생겼을 때 새로운 도구를 도입하며 그 이유를 기록합니다.

> 마지막 수정일: 8.24

## Today 구현 및 실행 확인

- `/today`에서 로그인한 사용자의 로컬 날짜 기준 오늘 할 일을 등록·조회·수정·삭제합니다.
- 제목은 공백 제거 후 1~100자이며, 목록은 생성 시각 순서로 유지합니다.
- `todos` 문서에는 기존 필드와 함께 서버 타임스탬프 `createdAt`이 저장됩니다.
- 날짜가 바뀌면 오늘 목록을 다시 조회하며, 지난 날짜의 기록 조회와 미완료 항목의 오늘로 가져오기를 지원합니다.
- 이월 기록 조회에 실패해도 할 일 목록은 표시합니다. 이월 여부를 확인할 때까지 선택과 가져오기는 제한하며, 목록 새로고침으로 재시도합니다.
- 이월은 원본을 보관하고 새 할 일과 영구 이월 기록을 함께 생성합니다. 가져온 할 일을 삭제해도 같은 원본을 같은 날 다시 가져올 수 없습니다.
- 대시보드 통계 연동은 후속 작업입니다.

### Firestore 접근 규칙

`firestore.rules`는 본인 todos 접근, 필드 타입, 생성 시각과 소유자 변경 제한을 정의합니다.
파일 추가만으로 원격 Firebase 프로젝트의 규칙이 변경되지는 않습니다.
Firebase 콘솔에서 대상 프로젝트와 현재 규칙을 확인하고 todos 규칙을 반영해야 합니다.
기존 컬렉션 규칙이 있다면 보존하고, 광범위한 허용 규칙이 todos 제한을 무효화하지 않는지 확인하세요.
Firebase CLI를 사용하는 경우 프로젝트를 명시하여 `firebase deploy --only firestore:rules --project <project-id>`로 적용할 수 있습니다.
현재 규칙 파일은 todos, studyLogs, interviewQuestions, users/{userId}/todoCarryovers 접근을 정의하므로 배포 전 기존 규칙과 비교해야 합니다.

#### 지난 할 일 및 이월 규칙 적용 (#40)

로컬 환경의 프로젝트 ID는 `upday-c46af`입니다. Firebase 콘솔에서 해당 프로젝트의 **Firestore Database → 규칙**을 열어 현재 배포본을 보관하고, 이 저장소의 `firestore.rules`와 비교한 뒤 적용합니다. 배포본에만 있는 다른 규칙이 있다면 먼저 보존·병합해야 합니다.

CLI를 사용할 경우 접근 권한이 있는 계정으로 로그인한 후 실행합니다.

```powershell
npx --yes firebase-tools deploy --only firestore:rules --project upday-c46af
```

로컬 파일 수정이나 프런트엔드 배포만으로는 Firestore 규칙이 반영되지 않습니다. 수정한 프런트엔드와 규칙을 모두 적용한 뒤 과거 날짜 조회, 빈 목록, 오늘로 가져오기, 삭제 후 같은 날 재이월 제한을 확인합니다.

보안 규칙 테스트는 Java 21 이상이 설치된 환경에서 `npm run test:rules`로 실행합니다. `demo-upday` 에뮬레이터만 사용하며 운영 데이터에는 접근하지 않습니다. 일반 `npm test`에서는 에뮬레이터가 필요한 테스트를 건너뜁니다.

### 학습 기록 단건 조회와 페이지네이션 (#43)

- 상세·수정 화면은 로그인 사용자와 문서 ID 조건으로 한 건만 조회합니다. 신규 작성 화면에서는 기록을 조회하지 않습니다.
- 목록은 학습 날짜 내림차순 → 생성 시각 내림차순 → 문서 ID 오름차순으로 정렬합니다. 한 번에 20개를 표시하고 다음 페이지 유무 확인용 1개를 추가 조회하며, 마지막 표시 문서의 스냅샷을 다음 커서로 사용합니다.
- 날짜·태그 필터는 Firestore 쿼리에 적용합니다. 필터 변경과 목록 복귀 시 커서가 초기화됩니다.
- 히트맵·주간 통계·태그 목록·전체 개수는 별도 전체 메타데이터 조회를 사용합니다. Firebase ID 토큰을 사용하는 REST 필드 선택으로 제목·본문은 내려받지 않습니다. **통계 조회의 문서 읽기 수는 여전히 전체 기록 수에 비례합니다.** 페이지네이션이 통계의 읽기 비용까지 없애지는 않습니다.
- 기존 대시보드의 조회와 연속 학습일 계산은 유지합니다.

#### 직접 적용할 순서

운영 프로젝트에는 자동 적용하지 않습니다. **날짜 보완과 인덱스 준비를 완료한 뒤 프런트엔드를 배포**하세요.

1. `upday-c46af`의 기존 데이터와 인덱스를 확인·보관합니다. `firestore.indexes.json`의 복합 인덱스 2개를 기존 인덱스와 병합한 후 적용하고, 빌드 완료를 기다립니다. 기존 인덱스 삭제를 승인하지 마세요.

   ```powershell
   npx --yes firebase-tools deploy --only firestore:indexes --project upday-c46af
   ```

2. Google Cloud CLI에서 프로젝트 읽기·수정 권한이 있는 계정으로 인증하고, 날짜 보완 예정 내역을 확인합니다. Firebase CLI 로그인과 Google Cloud CLI 인증은 별개입니다. 토큰은 출력하거나 저장소에 저장하지 마세요.

   ```powershell
   gcloud auth login
   $env:GOOGLE_OAUTH_ACCESS_TOKEN = gcloud auth print-access-token
   node scripts/backfill-study-dates.mjs --project upday-c46af
   ```

3. 출력한 날짜가 맞으면 적용합니다. 기본 시간대는 `Asia/Seoul`이며 `--timezone`으로 변경할 수 있습니다. 다른 시간대에서 보던 옛 기록은 날짜 해석이 달라질 수 있으므로 예정 내역을 먼저 확인하세요.

   ```powershell
   node scripts/backfill-study-dates.mjs --project upday-c46af --apply
   node scripts/backfill-study-dates.mjs --project upday-c46af
   Remove-Item Env:GOOGLE_OAUTH_ACCESS_TOKEN
   ```

   `studyDate`가 없는 문서만 수정하며, 기존 날짜·생성 시각·본문은 유지합니다. 문서의 `updateTime` 조건으로 동시 수정 시 덮어쓰기를 막습니다. 실패 건은 종료 코드 1로 알리므로 해결 후 재실행하세요. 마지막 확인에서 후보와 실패가 모두 0이어야 합니다. 날짜가 없는 기록이 남으면 목록 전체에서 일부 기록만 누락되는 대신 안내를 표시합니다.

4. 프런트엔드를 배포하고 상세·수정·신규 작성, 필터, 더 보기, 저장·삭제 후 목록 복귀를 확인합니다. 이 작업에 Firestore 보안 규칙 변경은 없습니다.

`npm run test:rules`는 Java 21 이상에서 학습 기록 및 기존 할 일 규칙 테스트를 에뮬레이터로 실행합니다. 에뮬레이터는 운영 복합 인덱스 준비 상태를 검증하지 않으므로 콘솔에서도 확인해야 합니다.

참고: [Firestore 커서](https://firebase.google.com/docs/firestore/query-data/query-cursors), [REST 인증과 보안 규칙](https://firebase.google.com/docs/firestore/use-rest-api), [필드 선택](https://firebase.google.com/docs/firestore/reference/rest/v1/StructuredQuery).

### 오늘 할 일 수동 검증 항목

- 계정 A로 등록·수정·완료·취소·삭제 후 새로고침해 저장 결과 확인
- 계정 B와 비로그인 상태에서 A의 문서 읽기·수정·삭제가 규칙으로 거부되는지 확인
- 다른 UID로 생성, 소유자·날짜·생성 시각 변경, 빈 제목·잘못된 타입 저장 거부 확인
- 빈 목록 0%, 완료/삭제 후 진행률, 오류 후 입력 유지와 재시도 확인
- 자정 및 탭 복귀 시 날짜 갱신, 이전 날짜 기록 보존 확인
- 모바일 화면, 키보드 조작, 기존 로그인·로그아웃·헤더 이동 확인

규칙의 실제 서버 적용과 계정 간 접근 검증은 별도로 필요합니다.

## Study 학습 날짜·태그·주간 통계

- 작성·수정 화면에서 실제 학습일을 선택합니다. 기본값은 로컬 오늘이며 미래 날짜와 유효하지 않은 날짜는 저장할 수 없습니다.
- `studyDate`는 `YYYY-MM-DD` 문자열입니다. `createdAt`은 최초 생성 시각으로 유지합니다.
- 상세·수정 및 통계는 `studyDate`가 없으면 `createdAt`의 로컬 날짜를 사용합니다. 페이지네이션 배포 전에는 위 #43 절차로 날짜가 없는 기록을 보완해야 합니다. 보완된 학습일은 시간대를 바꿔도 유지됩니다.
- 목록은 학습일 내림차순이며, 같은 학습일은 생성 시각 순으로 정렬합니다. 잔디의 최근 1년·올해·이번 달·연도 선택과 대시보드 연속 학습일도 학습일을 기준으로 계산합니다.
- 태그 필터는 저장된 태그를 하나 선택하며 대소문자를 구분합니다. 잔디의 날짜 선택과 함께 적용되고, 필터 해제로 두 조건을 초기화합니다.
- 주간 통계는 월요일~일요일 기준 총 학습 시간·기록 수·학습한 날 수·요일별 시간을 표시합니다. 목록 필터와 독립적으로 전체 기록을 집계하며 이전 주·다음 주·이번 주 이동을 지원합니다. 기록이 없는 날과 주는 0으로 표시됩니다.

### Study 규칙 적용 및 확인

새 클라이언트를 사용하기 전에 `firestore.rules`의 studyLogs 변경을 대상 Firebase 프로젝트에 적용해야 합니다. 기존 규칙에서는 `studyDate` 필드가 거부됩니다. 이번 작업은 규칙 파일만 변경하며 원격 배포는 수행하지 않습니다.

- 신규 기록에는 `studyDate`가 필수이며, 기존 기록은 날짜 필드 없이도 읽을 수 있습니다.
- 날짜 형식·실제 달력 날짜를 검증하고 소유자 및 생성 시각 변경을 제한합니다. 한 번 저장한 날짜 필드의 제거는 허용하지 않습니다.
- 서버는 장치 시간대를 알 수 없어 UTC+14의 오늘까지 허용하고, 클라이언트는 사용자의 로컬 오늘까지 제한합니다. 서버 날짜 구성에는 [Firebase timestamp.date](https://firebase.google.com/docs/reference/rules/rules.timestamp#date)를 사용합니다.
- `npm test`는 날짜 검증·기존 기록 호환·월/연도/윤년/주 경계·날짜와 태그 교집합·폼 저장·통계 및 기존 잔디 동작을 검증합니다. Firestore 호출은 대체하여 실행합니다.
- Firebase 에뮬레이터 또는 별도 테스트 프로젝트에서 타 사용자 접근 거부, 잘못된 학습일 거부, 기존 문서에 날짜 추가, 날짜 수정 시 createdAt 유지 여부를 별도로 확인해야 합니다.

## Interview 질문·답변 등록 및 조회 (#32)

- `/interview`에서 본인의 질문을 최신 등록순으로 조회합니다. `/interview?new=1`에서 등록하고 `/interview?question=<id>`에서 상세 내용을 확인합니다.
- 질문은 앞뒤 공백 제거 후 1~300자, 답변은 선택 입력이며 최대 10,000자입니다. 답변이 없으면 빈 문자열을 저장합니다.
- 태그는 쉼표로 구분합니다. 앞뒤 공백과 빈 태그를 제거하고 동일한 태그는 한 번만 저장합니다. 태그당 30자, 중복 제거 후 최대 10개이며 대소문자를 구분합니다.
- 저장 중에는 제출을 잠그고, 실패하면 입력을 유지합니다. 재시도에는 같은 문서 ID를 사용하며 서버에 이미 동일한 내용이 저장되었는지 확인해 중복 생성을 방지합니다. 저장 완료 안내에서 상세 화면으로 이동합니다.
- 목록·상세 조회에는 로그인한 사용자의 UID 조건을 적용합니다. 로딩·오류·재시도·빈 목록·없는 질문 안내를 제공합니다.
- `interviewQuestions` 문서 필드: `userId`, `question`, `answer`, `tags`, `status: 'unknown'`, `lastReviewedAt: null`, `createdAt: serverTimestamp()`.
- 수정·삭제, 이해 상태 변경 및 복습일 기록을 지원합니다. 필터 및 대시보드 통계 연동은 후속 작업입니다.

### Interview 규칙 적용 및 검증

`firestore.rules`는 본인 문서 읽기·생성·수정·삭제 및 필드 검증을 정의합니다. 소유자와 생성 시각 변경을 차단하고 복습일 변경에는 서버 시각을 요구합니다. 규칙 파일 변경만으로 원격 프로젝트에 적용되지는 않으며, 실제 배포는 대상 프로젝트와 기존 규칙을 확인한 후 별도로 진행합니다.

- `npm test`: 입력 경계값, 태그 정규화, 저장 필드, 사용자별 조회, 최신순 정렬, 상세·없는 질문, 오류·재시도, 중복 제출, 실패 시 입력 유지, 계정 변경 시 폼 초기화를 검증합니다. Firestore 호출은 테스트 대역을 사용합니다.
- `npm run lint`, `npm run build`: 정적 검사 및 프로덕션 빌드 확인.
- Firebase 에뮬레이터 또는 별도 테스트 프로젝트에서 계정 A의 등록·새로고침 후 조회, 계정 B 및 비로그인 접근 거부를 확인해야 합니다.
- 실제 규칙 검증 항목: 타 사용자 읽기·수정·삭제 거부, 다른 UID 생성, 빈 질문·길이 초과·중복 태그·추가 필드·잘못된 상태·소유자 및 생성 시각 변경·임의 복습 시각 거부. 에뮬레이터 테스트와 원격 규칙 적용은 별도로 확인해야 합니다.

## 비밀번호 재설정 (#36)

- 로그인 화면의 ‘비밀번호를 잊으셨나요?’ 링크에서 `/reset-password`로 이동합니다. 비로그인 상태에서도 접근할 수 있습니다.
- 이메일 앞뒤 공백과 형식을 검증한 뒤 `sendPasswordResetEmail(auth, email)`을 호출합니다. 요청 중 입력·제출을 비활성화하고 중복 요청을 막습니다.
- 성공과 `auth/user-not-found`에는 동일한 완료 문구를 표시합니다. 계정 조회 API로 가입 여부를 확인하지 않습니다. 네트워크·요청 횟수 초과 오류는 입력을 유지하고 재시도를 지원합니다.
- 새 비밀번호 입력은 Firebase 기본 이메일 작업 페이지에서 처리합니다. `/reset-password`는 메일 요청 전용으로, 재설정 링크의 작업 URL로 설정하면 안 됩니다.

### Firebase 콘솔 및 실제 메일 확인

코드만으로 원격 메일 템플릿 설정이나 실제 수신 결과를 확인할 수 없으므로 아래 항목은 별도 확인이 필요합니다. 이번 작업에서는 원격 설정을 변경하거나 실제 계정의 비밀번호를 변경하지 않았습니다.

1. 앱 환경 변수의 Firebase 프로젝트와 콘솔 프로젝트가 같은지 확인합니다.
2. Authentication의 이메일/비밀번호 제공업체 활성화와 Templates의 Password reset 템플릿에서 발신자·제목·본문·언어를 확인합니다.
3. 링크의 작업 URL은 Firebase 기본 처리 페이지를 사용합니다. 기존 사용자 정의 URL이 있다면 기본 페이지로 복구할지 확인합니다. 코드에서 별도 continue URL이나 ActionCodeSettings는 지정하지 않습니다.
4. 테스트 이메일 계정으로 요청하여 메일함·스팸함, 링크 이동, 비밀번호 변경 및 새 비밀번호 로그인까지 확인합니다.
5. 사용한 링크 재사용·만료된 링크에서 Firebase의 오류 안내를 확인합니다. 필요한 경우 요청 화면으로 돌아와 다시 발송합니다.
6. 미등록 이메일에도 동일한 완료 안내가 표시되는지, 기존 회원가입·로그인이 정상인지 확인합니다.

`npm test`는 실제 React 화면에서 검증·공백 제거·중복 제출·완료 문구·오류 재시도·공개 경로와 로그인 링크를 검증합니다. Firebase 발송은 테스트 대역으로 대체하므로 실제 메일 수신 검증을 대신하지 않습니다.

참고: [Firebase 비밀번호 재설정 이메일 문서](https://firebase.google.com/docs/auth/web/manage-users#send_a_password_reset_email)
