import { useAuth } from '../hooks/useAuth'
import { useStudyLogs } from '../hooks/useStudyLogs'
import StudyForm from '../components/StudyForm'
import StudyList from '../components/StudyList'
import StudyDetail from '../components/StudyDetail'
import '../styles/study.css'

function StudyScreen({ userId, selected, formView }: { userId: string; selected: string | null; formView: boolean }) {
  const { record, overview, loading, error, reload, revision } = useStudyLogs(userId, selected, formView)
  return <section className="study-page" aria-labelledby="study-heading">
    <header><p className="study-eyebrow">STUDY</p><div className="study-heading-row">
      <h1 id="study-heading">내 학습 기록</h1>
      {!formView && !selected && <a className="study-page-link" href="/study?new=1">새 학습 기록</a>}
    </div></header>
    {selected && !formView && <a className="study-back" href="/study">← 목록으로</a>}
    <div className="study-grid">
      {!formView && !selected ? <StudyList userId={userId} overview={overview} revision={revision} loading={loading} error={error} reload={reload} />
        : loading ? <p role="status">학습 기록을 불러오고 있습니다.</p> : error ? <div className="study-panel" role="alert"><p>{error}</p><button type="button" onClick={reload}>다시 불러오기</button></div>
        : selected && !record ? <section className="study-panel"><p>학습 기록을 찾을 수 없거나 접근 권한이 없습니다.</p><a href="/study">목록으로</a></section>
        : formView ? <StudyForm key={record?.id ?? 'new'} userId={userId} record={record ?? undefined} />
        : record && <StudyDetail key={record.id} record={record} />}
    </div>
  </section>
}

export default function StudyPage() {
  const { user, isLoading, error } = useAuth()
  if (error) return <p role="alert">{error}</p>
  if (isLoading || !user) return <p role="status">로그인 상태를 확인하고 있습니다.</p>
  const params = new URLSearchParams(window.location.search)
  const selected = params.get('record')
  const formView = params.get('new') === '1' || params.get('edit') === '1'
  return <StudyScreen key={JSON.stringify([user.uid, selected, formView])} userId={user.uid} selected={selected} formView={formView} />
}
