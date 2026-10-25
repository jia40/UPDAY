import { FirebaseError } from 'firebase/app'
export function errorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === 'permission-denied') return '면접 질문에 접근할 권한이 없습니다. 로그인 상태와 데이터 접근 설정을 확인해주세요.'
    return '요청을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.'
  }
  return error instanceof Error && error.message ? error.message : '요청에 실패했습니다. 다시 시도해주세요.'
}
