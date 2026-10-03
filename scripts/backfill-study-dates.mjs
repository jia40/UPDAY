import { pathToFileURL } from 'node:url'

export function dateInZone(timestamp, timeZone = 'Asia/Seoul') {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) throw new Error('유효한 createdAt이 없습니다.')
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`
}

// Dry run by default. A precondition prevents overwriting concurrently edited records.
export async function backfill({ project, token, apply = false, timeZone = 'Asia/Seoul', request = fetch, report = console.log }) {
  if (!/^[a-z][a-z0-9-]+$/.test(project ?? '') || !token) throw new Error('프로젝트 ID와 GOOGLE_OAUTH_ACCESS_TOKEN이 필요합니다.')
  dateInZone(new Date().toISOString(), timeZone)
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const result = { scanned: 0, candidates: 0, updated: 0, skipped: 0, failed: 0 }
  let cursor
  while (true) {
    const response = await request(`${base}:runQuery`, { method: 'POST', headers, body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'studyLogs' }], select: { fields: [{ fieldPath: 'studyDate' }, { fieldPath: 'createdAt' }] },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 200,
      ...(cursor ? { startAt: { values: [{ referenceValue: cursor }], before: false } } : {}),
    } }) })
    if (!response.ok) throw new Error(`학습 기록 조회 실패 (HTTP ${response.status}). 접근 권한과 토큰 만료를 확인해주세요.`)
    const documents = (await response.json()).flatMap(row => row.document ? [row.document] : [])
    if (!documents.length) break
    for (const document of documents) {
      result.scanned++
      if (document.fields && 'studyDate' in document.fields) { result.skipped++; continue }
      try {
        const studyDate = dateInZone(document.fields?.createdAt?.timestampValue, timeZone)
        result.candidates++
        report(`${apply ? 'APPLY' : 'DRY RUN'} ${document.name.split('/').at(-1)} -> ${studyDate}`)
        if (apply) {
          if (!document.updateTime) throw new Error('동시 수정 확인을 위한 updateTime이 없습니다.')
          const updated = await request(`${base}:commit`, {
            method: 'POST', headers, body: JSON.stringify({ writes: [{
              update: { name: document.name, fields: { studyDate: { stringValue: studyDate } } },
              updateMask: { fieldPaths: ['studyDate'] }, currentDocument: { updateTime: document.updateTime },
            }] }),
          })
          if (!updated.ok) throw new Error(`날짜 보완 실패 (HTTP ${updated.status}); 동시 수정 또는 권한을 확인해주세요.`)
          result.updated++
        }
      } catch (error) { result.failed++; report(`${document.name.split('/').at(-1)}: ${error.message}`) }
    }
    cursor = documents.at(-1).name
    if (documents.length < 200) break
  }
  report(JSON.stringify({ project, timeZone, apply, ...result }))
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const value = name => args[args.indexOf(name) + 1]
  try {
    const result = await backfill({ project: args.includes('--project') ? value('--project') : undefined, token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN,
      apply: args.includes('--apply'), timeZone: args.includes('--timezone') ? value('--timezone') : 'Asia/Seoul' })
    if (result.failed) process.exitCode = 1
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
