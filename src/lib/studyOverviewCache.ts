import type { StudySummary } from './studyLogs'

export const STUDY_OVERVIEW_TTL_MS = 60_000
type Entry = { value?: StudySummary[]; expires: number; pending?: Promise<StudySummary[]> }
const entries = new Map<string, Entry>()
export function invalidateStudyOverview(userId?: string) {
  if (userId) entries.delete(userId)
  else entries.clear()
}
export async function cachedStudyOverview(userId: string, load: () => Promise<StudySummary[]>, force = false): Promise<StudySummary[]> {
  let entry = entries.get(userId)
  if (entry?.pending) return entry.pending
  if (!force && entry?.value && Date.now() < entry.expires) return entry.value
  entry = { expires: 0 }
  entries.set(userId, entry)
  const current = entry
  const pending = Promise.resolve().then(load).then(value => {
    // Invalidation detaches the previous request. Its consumers join the new
    // generation instead of publishing or caching an obsolete result.
    if (entries.get(userId) !== current) return cachedStudyOverview(userId, load)
    current.value = value; current.expires = Date.now() + STUDY_OVERVIEW_TTL_MS
    return value
  }).catch(reason => {
    if (entries.get(userId) === current) entries.delete(userId)
    throw reason
  }).finally(() => { if (entries.get(userId) === current) current.pending = undefined })
  current.pending = pending
  return pending
}
