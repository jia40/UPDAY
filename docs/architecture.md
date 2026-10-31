# 데이터 구조와 조회 정책

[README로 돌아가기](../README.md)

## 인증·화면 구조

`src/main.tsx`의 AuthProvider가 `onAuthStateChanged` 구독을 관리합니다. `useAuth`는 user·isLoading·error·refreshProfile을 공유하고 Provider 외부 호출은 오류로 알립니다. StrictMode 재실행 때 구독을 정리하며 해제 후 늦은 콜백을 무시합니다.

MainLayout은 보호 경로의 인증을 확인합니다. GuestOnly는 최초 진입 결과만 판단하여 비로그인으로 진입한 회원가입 폼이 임시 로그인 중에도 유지되게 합니다. 회원가입은 계정 생성 → 이름 저장 → 로그아웃 순서이며 중간 실패 시 완료한 단계를 중복 실행하지 않고 재시도합니다.

마이페이지는 Firebase Authentication의 displayName·email·metadata.creationTime을 사용합니다. 이름 수정은 2~50자이며 updateProfile 후 refreshProfile로 같은 User 객체의 변경을 다른 소비자에 알립니다. 별도 users 프로필 문서는 만들지 않습니다.

페이지는 `App.tsx`에서 경로·쿼리로 구분하며 지연 로딩합니다. PageLoader는 로딩과 페이지 로드 실패·재로딩을 처리합니다. 내부 이동도 일반 링크나 location 이동을 사용하므로 페이지 간 메모리 캐시 영속성을 가정하지 않습니다.

`src/lib/firebase.ts`는 웹 앱·Authentication만 초기화하고, Firestore는 `src/lib/firestore.ts`를 데이터 화면에서 import할 때 초기화합니다. 따라서 인증만 필요한 공개 경로에는 Firestore SDK를 포함하지 않습니다. 두 파일은 같은 Firebase 앱을 사용합니다.

## Firestore 컬렉션

날짜 문자열은 별도 표시가 없으면 `YYYY-MM-DD`, 시각 필드는 Firestore Timestamp입니다. UID는 Firebase Authentication 사용자 식별자입니다.

| 경로 | 저장 필드 |
| --- | --- |
| `todos/{todoId}` | userId, title, completed, date, createdAt, 선택 sourceTodoId |
| `users/{userId}/todoCarryovers/{receiptId}` | sourceTodoId, targetTodoId, date, createdAt |
| `studyLogs/{logId}` | userId, title, content, tags, studyMinutes, studyDate, createdAt |
| `interviewQuestions/{questionId}` | userId, question, answer, tags, status, lastReviewedAt, createdAt |
| `applications/{applicationId}` | userId, company, position, url, status, appliedAt, memo, createdAt, updatedAt |

users 경로는 현재 이월 영수증의 상위 경로이며 일반 계정 프로필 컬렉션으로 사용하지 않습니다. studyDate는 신규 Study 기록에 필수이며 과거 문서에는 없을 수 있습니다. appliedAt은 타임스탬프가 아니라 날짜 문자열 또는 빈 문자열입니다.

## 입력과 저장 규칙

| 대상 | 클라이언트 입력 기준 |
| --- | --- |
| Todo | 제목 공백 제거 후 1~100자 |
| Study | 제목 1~100자, 내용 1~10,000자, 시간 1~1,440분, 실제 학습일은 로컬 오늘까지 |
| Study·Interview 태그 | 쉼표 분리·앞뒤 공백/빈 값 제거·중복 제거, 태그당 30자·최대 10개, 대소문자 구분 |
| Interview | 질문 1~300자, 선택 답변 최대 10,000자 |
| Job | 기업명·포지션 각각 1~100자, 선택 HTTP/HTTPS URL 최대 2,000자, 선택 메모 최대 10,000자, 선택 지원일은 로컬 오늘까지 |
| 마이페이지 이름 | 공백 제거 후 2~50자, 기존 이름과 같으면 저장 생략 |

Job 상태 값은 interested(관심), planned(지원 예정), applied(지원 완료), screening(서류), coding(코딩테스트), interview(면접), accepted(합격), rejected(탈락)입니다. 초기 상태는 interested이며 순서와 관계없이 변경할 수 있습니다.

Interview 상태는 unknown(모름), learning(이해 중), explainable(설명 가능)입니다. 신규 기록은 unknown·lastReviewedAt null이며 복습 완료는 서버 타임스탬프를 저장합니다.

보안 규칙은 본인 문서 접근과 필드·타입을 검증하며 소유자·최초 생성 시각 변경을 제한합니다. Study·Job의 서버 날짜 검증은 장치 시간대를 알 수 없어 UTC+14의 오늘까지 허용하고, 클라이언트는 로컬 오늘까지 제한합니다. 정확한 허용 조건은 루트 firestore.rules가 기준입니다.

Todo·Study·Interview·Job 생성은 같은 문서 ID로 재시도합니다. 응답 유실 시 본인 UID와 ID로 저장 여부를 확인하고 요청 내용이 일치하면 성공으로 복구합니다. Todo는 이후 변경된 완료 상태·생성 시각을 보존합니다. 내용 충돌이나 검증 조회 실패는 성공으로 간주하지 않습니다.

## Today와 이월

- 할 일은 선택 날짜와 UID 조건으로 조회하고 생성 시각·ID 순으로 표시합니다. 과거 날짜는 조회만 가능합니다.
- 미완료 선택 이월은 원본을 보관하고 오늘 할 일과 영구 영수증을 항목별 트랜잭션으로 생성합니다. 영수증 ID는 `원본ID_오늘날짜`입니다.
- 이월한 할 일을 삭제해도 같은 원본을 같은 날 다시 이월할 수 없습니다. 일부 항목 처리 후 실패해도 재시도 시 영수증으로 중복 생성을 막습니다.
- 이월 기록 조회 실패 시 과거 목록은 유지하지만 선택·가져오기를 제한하고 새로고침으로 복구합니다. 자동 이월은 없습니다.
- 학습 시간은 studyLogs의 UID·studyDate 조건으로 조회·합산합니다. studyDate 없는 기존 기록은 날짜 보완 전에는 포함되지 않습니다.

## Study 조회·통계

- 상세·수정은 UID·문서 ID 조건의 단건 조회입니다. 신규 폼에서는 기록을 조회하지 않습니다.
- 목록은 학습일 내림차순 → 생성 시각 내림차순 → 문서 ID 오름차순입니다. 20개 표시와 다음 페이지 확인용 1개를 조회하고 마지막 표시 문서의 스냅샷을 커서로 사용합니다.
- 날짜·태그 필터는 Firestore 목록 쿼리에 적용합니다. 조건 변경·목록 복귀 시 커서를 초기화하고 더 보기 실패 시 기존 목록을 유지합니다.
- 잔디·주간/월간 통계·태그·전체 개수·연속 학습일은 별도 전체 메타데이터에서 계산합니다. REST 필드 선택으로 studyDate·createdAt·studyMinutes·tags만 가져옵니다.
- 상세·통계의 기존 날짜 호환 처리는 studyDate가 없을 때 createdAt의 로컬 날짜를 사용합니다. 날짜가 없는 기록이 있으면 목록도 동일한 기준으로 기존 메타데이터를 정렬·필터링하고, 사용자 UID·문서 ID 조건으로 본문을 최대 20개씩 조회합니다. 반환 순서는 메타데이터 순서로 복원하고 생성 시각이 같으면 문서 ID로 순서를 고정합니다. 메타데이터 조회 후 삭제된 페이지는 건너뜁니다.
- 날짜 보완 후 메타데이터를 갱신하면 일반 스냅샷 커서 조회로 돌아갑니다. 호환 경로에서는 목록 표시 중 데이터가 바뀌면 새로고침으로 메타데이터와 순서를 갱신해야 합니다. Today 학습 시간에는 여전히 실제 studyDate 보완이 필요합니다.
- 잔디는 최근 1년·올해·이번 달·과거 연도를 지원합니다. 주간은 월요일~일요일, 월간은 이번 달 오늘까지·과거 월 말일까지이며 목록 필터와 독립적입니다.
- `/study?date=...`는 날짜 필터, `/study?new=1&date=...`는 기본 학습일을 지정합니다. 유효하지 않거나 미래인 URL 날짜는 무시합니다.

## Study 통계 캐시

- UID별 메모리 캐시의 유효 기간은 **성공 응답 완료부터 60초**입니다. 동일 UID의 진행 중 요청을 공유합니다.
- 자동 focus·pageshow·visibilitychange 갱신은 유효 캐시를 사용하며, 만료 후 첫 요청이 서버 조회를 수행합니다. 주기적 타이머 조회는 없습니다.
- Study의 ‘학습 기록 새로고침’과 오류 재시도는 캐시를 우회하지만 이미 진행 중인 요청은 공유합니다. 대시보드는 오류 시 ‘다시 불러오기’만 제공합니다.
- Study 생성·수정·삭제와 동일 기록 복구 성공 시 UID 캐시를 무효화합니다. 이전 요청의 응답이 구 세대 값을 저장하지 않고 최신 요청에 합류하도록 합니다. 오류 응답은 캐시하지 않습니다.
- 로그인·로그아웃·계정 객체 변경·인증 오류 시 캐시를 정리합니다. 조회 전후 계정을 검사하고 반환 배열·태그는 복사합니다.
- 다른 탭·기기 변경은 만료 후 갱신 이벤트 또는 수동 새로고침으로 반영됩니다. 전체 새로고침·일반 링크의 문서 이동 시 메모리가 초기화됩니다.
- 최초·만료·강제 조회의 읽기 문서 수는 전체 사용자 기록 수에 비례합니다. 캐시와 페이지네이션이 최초 통계 조회 비용을 없애지는 않습니다.

## Interview 페이지네이션·복습

InterviewPage는 경로와 인증 진입, InterviewForm·InterviewDetail은 작성·상세를 담당합니다. useInterviewRecords는 메타데이터/단건 조회, useInterviewPage는 페이지 커서·추가 조회·재시도를 담당합니다.

1. 질문·답변 없이 ID·생성 시각·상태·태그·복습일의 전체 메타데이터를 가져옵니다.
2. 상태·태그·복습 조건을 전체 메타데이터에 교집합 적용하여 개수와 대상 ID를 계산합니다.
3. 생성 시각 내림차순(나노초 포함) → ID 오름차순으로 20개와 확인용 1개를 선택합니다.
4. 소유자와 문서 ID IN 조건의 REST 필드 선택으로 목록 질문·상태·태그·시각만 가져옵니다. 답변은 상세·수정 단건 조회에서만 가져옵니다.

Web SDK 필드 선택 제약 때문에 스냅샷 대신 동일 메타데이터 세션의 마지막 문서 ID를 커서로 사용합니다. 페이지 조회 사이에 삭제된 문서는 건너뛰되 커서는 진행합니다. 필터를 벗어난 상태·태그로 바뀐 문서는 제외합니다. 전체·조건 일치 개수는 메타데이터 조회 시점이며 실제 표시 개수와 구분합니다.

필터·계정·날짜 변경과 목록 재조회 시 페이지를 초기화합니다. 더 보기 실패는 기존 목록·커서를 유지합니다. 탭 복귀·브라우저 복원은 메타데이터를 갱신합니다. 다른 탭의 추가·수정은 재조회 전까지 정렬 대상에 반영되지 않을 수 있습니다.

전체 메타데이터 읽기는 사용자 질문 수에 비례하고 페이지마다 최대 21개 문서를 추가로 읽습니다. 복습 대상은 needsInterviewReview 공통 함수로 미복습 또는 로컬 달력 7일 경과를 판단하며 설명 가능·미래 복습일은 제외합니다.

## Dashboard와 Job

DashboardTodayCard는 오늘 할 일, DashboardStudyCard는 캐시된 Study 메타데이터로 연속 학습일을 계산합니다. DashboardCareerCard는 카드별 로딩·오류·재시도를 분리하며 Interview는 상태·복습일, Job은 상태만 REST 필드 선택으로 가져옵니다. 이 두 카드의 집계 읽기도 전체 해당 사용자 기록 수에 비례합니다.

Job 목록은 본인 기록을 전체 조회해 최신 등록순으로 정렬하고 클라이언트에서 상태를 필터링합니다. Job 목록 페이지네이션은 현재 구현되어 있지 않습니다.

## 주요 파일

| 위치 | 역할 |
| --- | --- |
| src/components/auth/ | 인증 Provider·게스트 경로·로그아웃 보호 |
| src/hooks/ | 인증 소비·조회·mutation·작성 내용 보호 |
| src/lib/ | Firebase 초기화·데이터 접근·날짜/통계 계산·캐시 |
| src/pages/ | 화면 진입과 경로 분기 |
| firestore.rules / firestore.indexes.json | 로컬 접근 규칙 / Study 복합 인덱스 |
| scripts/backfill-study-dates.mjs | 기존 학습 날짜 보완. 기본 dry run |
| tests/ | React·순수 로직·에뮬레이터 규칙 검증 |
