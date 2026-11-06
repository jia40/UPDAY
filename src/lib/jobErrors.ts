import { FirebaseError } from 'firebase/app'

export function errorText(reason: unknown) {
  if (reason instanceof FirebaseError) return reason.code === 'permission-denied' ? '지원 기록 접근이 거부되었습니다. 로그인과 applications 접근 규칙을 확인해주세요.' : '요청에 실패했습니다. 연결 상태를 확인하고 다시 시도해주세요.'
  return reason instanceof Error ? reason.message : '요청에 실패했습니다. 다시 시도해주세요.'
}
