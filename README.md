# Upday

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
feature: Google 로그인 구현
feature: 학습 기록 등록 기능 추가
fix: 로그인 실패 시 에러 처리
refactor: 인증 상태 로직을 useAuth로 분리
docs: README 프로젝트 소개 추가
```

---

## 🚀 Roadmap

### Phase 1 — MVP

* [ ] Firebase 연결
* [ ] Google 로그인
* [ ] 인증 상태 관리
* [ ] Todo CRUD
* [ ] Study Log CRUD
* [ ] Interview CRUD
* [ ] Job Application CRUD
* [ ] Dashboard 구현

### Phase 2 — Growth

* [ ] 학습 태그 필터
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
- 날짜가 바뀌면 오늘 목록을 다시 조회하며, 지난 기록은 보관합니다. 날짜별 조회와 미완료 항목 이월은 아직 제공하지 않습니다.
- 대시보드 통계 연동은 후속 작업입니다.

### Firestore 접근 규칙

`firestore.rules`는 본인 todos 접근, 필드 타입, 생성 시각과 소유자 변경 제한을 정의합니다.
파일 추가만으로 원격 Firebase 프로젝트의 규칙이 변경되지는 않습니다.
Firebase 콘솔에서 대상 프로젝트와 현재 규칙을 확인하고 todos 규칙을 반영해야 합니다.
기존 컬렉션 규칙이 있다면 보존하고, 광범위한 허용 규칙이 todos 제한을 무효화하지 않는지 확인하세요.
Firebase CLI를 사용하는 경우 프로젝트를 명시하여 `firebase deploy --only firestore:rules --project <project-id>`로 적용할 수 있습니다.
현재 규칙 파일은 todos만 허용하므로 배포 전 기존 규칙과 비교해야 합니다.

### 수동 검증 항목

- 계정 A로 등록·수정·완료·취소·삭제 후 새로고침해 저장 결과 확인
- 계정 B와 비로그인 상태에서 A의 문서 읽기·수정·삭제가 규칙으로 거부되는지 확인
- 다른 UID로 생성, 소유자·날짜·생성 시각 변경, 빈 제목·잘못된 타입 저장 거부 확인
- 빈 목록 0%, 완료/삭제 후 진행률, 오류 후 입력 유지와 재시도 확인
- 자정 및 탭 복귀 시 날짜 갱신, 이전 날짜 기록 보존 확인
- 모바일 화면, 키보드 조작, 기존 로그인·로그아웃·헤더 이동 확인

규칙의 실제 서버 적용과 계정 간 접근 검증은 별도로 필요합니다.
