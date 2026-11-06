import { useAuth } from '../hooks/useAuth'
import { useJobRecord } from '../hooks/useJobRecord'
import JobForm from '../components/JobForm'
import JobDetail from '../components/JobDetail'
import JobList from '../components/JobList'
import '../styles/job.css'

function JobRecord({ userId, id, editing }: { userId: string; id: string; editing: boolean }) {
  const { record, loading, error, retry } = useJobRecord(userId, id)
  if (loading) return <p role="status">지원 기록을 불러오고 있습니다.</p>
  if (error) return <section className="job-panel"><p role="alert">{error}</p><button onClick={retry}>다시 불러오기</button></section>
  if (!record) return <section className="job-panel"><h2>지원 기록을 찾을 수 없습니다.</h2><a href="/job">목록으로 돌아가기</a></section>
  return editing ? <JobForm record={record} userId={userId} /> : <JobDetail record={record} />
}

export default function JobPage() {
  const { user, isLoading, error } = useAuth()
  const params = new URLSearchParams(window.location.search)
  const id = params.get('application')
  const form = id === null && params.get('new') === '1'
  const editing = params.get('edit') === '1'
  if (error) return <p role="alert">{error}</p>
  if (isLoading || !user) return <p role="status">로그인 상태를 확인하고 있습니다.</p>
  return <section className="job-page"><header><p className="job-eyebrow">JOB</p><div className="job-heading-row"><h1>취업 지원</h1>{!form && id === null && <a className="job-new" href="/job?new=1">새 지원 기록</a>}</div><p className="job-help">관심 기업부터 합격까지, 지원 과정을 기록해보세요.</p></header>
    {id !== null && <a className="job-back" href="/job">← 목록으로</a>}
    {form ? <JobForm key={user.uid} userId={user.uid} /> : id !== null ? <JobRecord key={`${user.uid}:${id}:${editing}`} userId={user.uid} id={id} editing={editing} /> : <JobList key={user.uid} userId={user.uid} />}
  </section>
}
