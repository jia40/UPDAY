import type { InterviewQuestion, InterviewStatus } from './interviewQuestions'

type Reviewable = Pick<InterviewQuestion, 'status' | 'lastReviewedAt'>
// Compare local calendar days, rather than elapsed hours (including DST days).
function calendarDay(date: Date) {
  const utc = new Date(0)
  utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate())
  utc.setUTCHours(0, 0, 0, 0)
  return utc.getTime() / 86400000
}
export function needsInterviewReview(question: Reviewable, today = new Date()) {
  if (question.status === 'explainable') return false
  if (!question.lastReviewedAt) return true
  const reviewed = question.lastReviewedAt.toDate()
  return calendarDay(today) - calendarDay(reviewed) >= 7
}
export type InterviewFilters = { status: InterviewStatus | ''; tag: string; reviewOnly: boolean }
export function filterInterviewQuestions<T extends Reviewable & { tags: string[] }>(questions: readonly T[], filters: InterviewFilters, today = new Date()): T[] {
  return questions.filter(question => (!filters.status || question.status === filters.status)
    && (!filters.tag || question.tags.includes(filters.tag))
    && (!filters.reviewOnly || needsInterviewReview(question, today)))
}
