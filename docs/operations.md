# Firebase 운영 및 배포

[README로 돌아가기](../README.md) · [검증 가이드](testing.md)

이 문서는 수행 절차이며 운영 적용 완료 기록이 아닙니다. 로컬 파일 수정과 프런트엔드 배포만으로 Firebase 규칙·인덱스·메일 템플릿은 바뀌지 않습니다. 이번 문서 정리에서는 원격 설정이나 데이터를 변경하지 않습니다.

## 프로젝트와 사전 준비

1. `.env.local` 또는 배포 환경 변수의 Firebase 프로젝트가 콘솔 대상과 같은지 확인합니다.
2. 현재 운영 규칙·인덱스와 기존 데이터를 확인·보관합니다. 대상 프로젝트의 읽기·수정 권한을 확인합니다.
3. Authentication의 이메일/비밀번호 제공업체, 웹 앱 설정과 사용할 도메인을 확인합니다.
4. Firestore 접근 규칙을 비교·준비하고, Study 날짜 보완과 인덱스를 확인한 뒤 프런트엔드를 배포합니다.

아래 명령의 프로젝트 값은 자리표시자입니다. 실환경 ID는 Firebase 콘솔·환경 변수와 대조해 입력하며 기본 프로젝트 선택에 의존하지 않습니다.

```powershell
$targetProject = 'your-project-id'
```

## Firestore 규칙

루트 `firebase.json`은 `firestore.rules`와 `firestore.indexes.json`을 참조합니다. 현재 규칙은 todos·studyLogs·interviewQuestions·applications와 users/{userId}/todoCarryovers를 정의합니다.

- 기존 배포본에만 있는 컬렉션 규칙을 보존·병합합니다.
- 광범위한 허용 규칙이 본인 문서 제한을 무효화하지 않는지 확인합니다.
- Study 신규 기록의 studyDate, Interview 수정·삭제·서버 복습 시각, Job 필드, Today 이월 영수증 규칙이 현재 클라이언트와 일치해야 합니다.
- 생성 시각·소유자 변경 제한을 재시도 오류 해결 목적으로 완화하지 않습니다.
- 로컬 규칙 테스트 후 대상 프로젝트에서 계정 간 접근을 별도 확인합니다.

Firebase CLI에 권한 있는 계정으로 로그인하고 적용할 내용을 검토한 뒤 실행합니다. 최초 CLI 사용·에뮬레이터 실행에는 도구 다운로드가 필요할 수 있습니다.

```powershell
npx --yes firebase-tools login
npx --yes firebase-tools deploy --only firestore:rules --project $targetProject
```

프런트엔드가 새 필드를 사용하기 전에 호환되는 규칙을 먼저 준비합니다. 이전 클라이언트와 데이터의 호환성도 확인하세요.

## Study 인덱스

`firestore.indexes.json`에는 studyLogs의 복합 인덱스 두 개가 있습니다.

| 조건 | 인덱스 필드 순서 |
| --- | --- |
| 사용자·학습일 정렬 | userId 오름차순, studyDate 내림차순, createdAt 내림차순, 문서 ID 오름차순 |
| 사용자·태그·학습일 정렬 | userId 오름차순, tags ARRAY_CONTAINS, studyDate 내림차순, createdAt 내림차순, 문서 ID 오름차순 |

기존 운영 인덱스와 병합하고 적용합니다. 기존 인덱스 삭제를 승인하지 마세요. 배포 명령 성공뿐 아니라 콘솔에서 인덱스 빌드 완료를 기다립니다.

```powershell
npx --yes firebase-tools deploy --only firestore:indexes --project $targetProject
```

에뮬레이터는 운영 복합 인덱스 준비 상태를 검증하지 않습니다. Today의 UID·studyDate 조회와 Interview의 소유자·문서 ID IN 조회도 대상 Firebase에서 실행하여 필요한 경우 콘솔 오류 안내에 따라 기존 설정을 비교·보완합니다.

## 기존 Study 날짜 보완

목록의 날짜 정렬과 Today 학습 시간 집계에는 studyDate가 필요합니다. 상세·통계의 레거시 fallback만으로 목록 누락을 해결할 수 없습니다. **기존 날짜 없는 문서 보완과 인덱스 준비를 완료한 뒤 해당 프런트엔드를 배포합니다.**

`scripts/backfill-study-dates.mjs`의 동작은 다음과 같습니다.

- 기본은 dry run이며 `--apply`일 때만 저장합니다.
- studyDate 필드가 없는 문서만 후보로 선택합니다. 이미 존재하는 잘못된 날짜는 자동 교정하지 않습니다.
- 기본 시간대는 Asia/Seoul이며 createdAt을 해당 시간대 날짜로 해석합니다. 다른 시간대에서 보던 옛 기록은 날짜 해석이 달라질 수 있습니다.
- studyDate만 보완하고 기존 생성 시각·본문은 보존합니다. updateTime 조건으로 동시에 수정된 문서의 덮어쓰기를 막습니다.
- 실패 건이 있으면 종료 코드 1을 반환합니다. 오류를 해결하고 재실행해야 합니다.

Google Cloud CLI에 권한 있는 계정으로 인증합니다. Firebase CLI 로그인과 별개입니다. 토큰은 환경 변수로만 전달하고 출력·파일 저장·커밋하지 않습니다.

```powershell
gcloud auth login
$env:GOOGLE_OAUTH_ACCESS_TOKEN = gcloud auth print-access-token
try {
    node scripts/backfill-study-dates.mjs --project $targetProject --timezone Asia/Seoul
} finally {
    Remove-Item Env:GOOGLE_OAUTH_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
```

출력된 후보 문서와 예정 날짜가 맞는지 확인한 뒤 별도로 적용합니다. 환경 변수 토큰이 만료되면 다시 인증·발급합니다.

```powershell
$env:GOOGLE_OAUTH_ACCESS_TOKEN = gcloud auth print-access-token
try {
    node scripts/backfill-study-dates.mjs --project $targetProject --timezone Asia/Seoul --apply
    node scripts/backfill-study-dates.mjs --project $targetProject --timezone Asia/Seoul
} finally {
    Remove-Item Env:GOOGLE_OAUTH_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
```

최종 dry run에서 candidates와 failed가 모두 0인지 확인합니다. 각 명령의 종료 코드와 출력도 확인하세요. 기존 데이터에 없는 생성 시각·잘못된 값이나 동시 수정 오류는 별도로 처리해야 합니다.

## 비밀번호 재설정 메일

`/reset-password`는 메일 요청 전용입니다. 새 비밀번호 입력은 Firebase 기본 이메일 작업 페이지에서 처리합니다. 앱의 요청 경로를 이메일 재설정 링크의 작업 URL로 지정하지 마세요.

1. 앱 환경 변수와 콘솔 프로젝트가 일치하는지 확인합니다.
2. Authentication 이메일/비밀번호 제공업체 활성화와 Password reset 템플릿의 발신자·제목·본문·언어를 확인합니다.
3. 링크의 작업 URL은 Firebase 기본 처리 페이지를 사용합니다. 기존 사용자 정의 URL이 있으면 의도한 동작과 기본 페이지 복구 여부를 확인합니다. 코드에는 별도 continue URL·ActionCodeSettings가 없습니다.
4. 테스트 이메일로 요청해 받은 편지함·스팸함, 링크 이동, 비밀번호 변경과 새 비밀번호 로그인을 확인합니다.
5. 사용한 링크 재사용·만료 링크의 오류 안내 및 재요청을 확인합니다.
6. 미등록 이메일에도 같은 완료 안내가 표시되는지 확인합니다. 클라이언트는 성공과 auth/user-not-found를 동일하게 안내하며 가입 여부 조회 API를 호출하지 않습니다.

코드 테스트는 발송 API를 대체하므로 실제 수신 결과나 원격 템플릿 설정을 보장하지 않습니다.

## 프런트엔드 배포

```powershell
npm run lint
npm test
npm run build
npm run preview
```

`dist/`가 결과물입니다. Vercel 프로젝트의 빌드 명령은 `npm run build`, 출력 디렉터리는 `dist`로 맞추고 여섯 Firebase 환경 변수를 설정합니다. `VITE_` 설정은 빌드 시 포함되므로 변경 후 재배포합니다.

`vercel.json`의 rewrite로 assets 이외의 경로가 index.html을 받습니다. 로그인·Study 상세·Interview 상세 등 직접 URL 접근과 새로고침을 확인합니다. 실제 호스팅 연결·배포 성공 여부는 별도 확인 대상입니다.

현재 공통 JS 번들에는 크기 경고가 남아 있습니다. 빌드 성공과 성능 최적화 완료를 동일하게 판단하지 않습니다.

## 배포 후 확인

- 대상 프로젝트·계정이 맞고 모든 주요 화면이 직접 경로로 열리는지 확인
- 로그인·회원가입 중간 실패·로그아웃·이름 수정·비밀번호 재설정 메일 확인
- 과거 할 일 조회·이월·이월한 기록 삭제 후 같은 날 재이월 제한 확인
- Study 상세·수정·신규·날짜/태그 필터·20개 초과 더 보기·통계·저장 후 복귀 확인
- Interview 20개 초과 목록·필터 교집합·더 보기 재시도·상태/복습 후 목록 갱신 확인
- Job CRUD·상태 필터·대시보드 수치 일치 확인
- 다른 사용자와 비로그인 접근이 실제 규칙으로 거부되는지 확인
- 모바일·키보드·실제 브라우저의 이탈 경고 확인

이 체크리스트를 실행하기 전에는 원격 적용 및 수동 검증을 완료로 표시하지 않습니다.
