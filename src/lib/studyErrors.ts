import { FirebaseError } from 'firebase/app'

export function errorText(error: unknown) {
  if (error instanceof FirebaseError) {
    return error.code === 'permission-denied'
      ? '학습 기록 접근이 거부되었습니다. 로그인과 Firestore의 studyLogs 규칙을 확인해주세요.'
      : '요청에 실패했습니다. 연결 상태를 확인하고 다시 시도해주세요.'
  }
  return error instanceof Error ? error.message : '요청에 실패했습니다. 다시 시도해주세요.'
}

