export const mainPages = [
  { path: '/dashboard', label: '대시보드', description: '오늘의 성장 현황을 한눈에 확인해보세요.' },
  { path: '/today', label: '오늘 할 일', description: '오늘의 할 일과 학습 시간을 관리하는 공간입니다.' },
  { path: '/study', label: '학습 기록', description: '학습 기록과 성장 과정을 모아보는 공간입니다.' },
  { path: '/interview', label: '면접 준비', description: '면접 질문과 답변을 기록하고 복습하는 공간입니다.' },
  { path: '/job', label: '취업 지원', description: '관심 기업과 취업 지원 현황을 관리하는 공간입니다.' },
]

export function isPageActive(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(path + '/')
}
