import type { Timestamp } from 'firebase/firestore'
import { effectiveStudyDate } from './studyAnalytics'
import { needsInterviewReview } from './interviewReview'
import type { InterviewStatus } from './interviewQuestions'

export type SearchKind = 'study' | 'interview' | 'job'
export type SearchEntry = {
  id: string; text: string; createdAt: Timestamp; tags: string[]; status: string
  studyDate?: string; studyMinutes: number; lastReviewedAt: Timestamp | null; position: string; appliedAt: string
}
export type SearchFilters = { date?: string | null; tag?: string; status?: string; reviewOnly?: boolean; today?: string }
export const normalizeSearch = (value: string) => value.trim().toLowerCase()
export function searchRecords(kind: SearchKind, entries: SearchEntry[], query: string, filters: SearchFilters) {
  const needle = normalizeSearch(query)
  const today = filters.today ? new Date(filters.today + 'T12:00:00') : new Date()
  return entries.filter(entry => normalizeSearch(entry.text).includes(needle)
    && (!filters.tag || entry.tags.includes(filters.tag))
    && (!filters.status || entry.status === filters.status)
    && (kind !== 'study' || !filters.date || effectiveStudyDate(entry) === filters.date)
    && (kind !== 'interview' || !filters.reviewOnly || needsInterviewReview({ status: entry.status as InterviewStatus, lastReviewedAt: entry.lastReviewedAt }, today)))
    .sort((a, b) => (kind === 'study' ? (effectiveStudyDate(b) ?? '').localeCompare(effectiveStudyDate(a) ?? '') : 0)
      || b.createdAt.seconds - a.createdAt.seconds || b.createdAt.nanoseconds - a.createdAt.nanoseconds
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
