import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { StudyDay, StudyHeatmapData } from '../lib/studyHeatmap'
import '../styles/studyHeatmap.css'

type Props = { data: StudyHeatmapData; selectedDate: string | null; onSelect: (date: string) => void }
const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const describe = (day: StudyDay) => day.date + ' · 학습 기록 ' + day.count + '개'

export default function StudyHeatmap({ data, selectedDate, onSelect }: Props) {
  const { days, weeks } = data
  const [hovered, setHovered] = useState<StudyDay | null>(null)
  const [focused, setFocused] = useState<StudyDay | null>(null)
  const [tabDate, setTabDate] = useState(days[days.length - 1].date)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const scroll = useRef<HTMLDivElement>(null)
  const activeDate = days.some((day) => day.date === tabDate) ? tabDate : days[days.length - 1].date
  const preview = hovered ?? focused
  const total = days.reduce((sum, day) => sum + day.count, 0)
  useEffect(() => {
    if (scroll.current) scroll.current.scrollLeft = scroll.current.scrollWidth
  }, [])

  function navigate(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const index = days.findIndex((day) => day.date === date)
    const offsets: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }
    let next: number
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = days.length - 1
    else if (event.key in offsets) next = index + offsets[event.key]
    else return
    event.preventDefault()
    const day = days[Math.max(0, Math.min(days.length - 1, next))]
    buttons.current.get(day.date)?.focus()
  }

  return (
    <section className="study-panel study-heatmap" aria-labelledby="study-heatmap-heading">
      <div className="study-heading-row">
        <h2 id="study-heatmap-heading">학습 잔디</h2>
        <span className="study-help">최근 365일 · 기록 {total}개</span>
      </div>
      <p id="study-heatmap-help" className="study-help">날짜를 선택하면 해당 날짜의 기록을 볼 수 있어요. 방향키로 이동하고 Enter 또는 Space로 선택하세요.</p>
      <div className="study-heatmap__scroll" ref={scroll}>
        <div className="study-heatmap__calendar" role="group" aria-label="최근 365일 학습 기록" aria-describedby="study-heatmap-help">
          <div className="study-heatmap__weekdays" aria-hidden="true">
            <span className="study-heatmap__month" />
            {weekdays.map((day) => <span key={day}>{day}</span>)}
          </div>
          {weeks.map((week, index) => {
            const monthStart = week.find((day) => day?.date.endsWith('-01')) ?? (index === 0 ? week.find((day) => day !== null) : null)
            // A partial first week can sit immediately before a month boundary.
            const nextHasMonthStart = index === 0 && weeks[1]?.some((day) => day?.date.endsWith('-01'))
            return <div className="study-heatmap__week" key={index}>
              <span className="study-heatmap__month" aria-hidden="true">{monthStart && !nextHasMonthStart ? Number(monthStart.date.slice(5, 7)) + '월' : ''}</span>
              {week.map((day, weekday) => day ? <button
                key={day.date} type="button" className="study-heatmap__day" data-level={day.level}
                aria-label={describe(day)} aria-pressed={selectedDate === day.date}
                tabIndex={day.date === activeDate ? 0 : -1}
                ref={(node) => { if (node) buttons.current.set(day.date, node); else buttons.current.delete(day.date) }}
                onMouseEnter={() => setHovered(day)} onMouseLeave={() => setHovered(null)}
                onFocus={() => { setFocused(day); setTabDate(day.date) }} onBlur={() => setFocused(null)}
                onKeyDown={(event) => navigate(event, day.date)} onClick={() => onSelect(day.date)}
              /> : <span className="study-heatmap__blank" key={weekday} aria-hidden="true" />)}
            </div>
          })}
        </div>
      </div>
      <p className="study-heatmap__preview">{preview ? describe(preview) : total === 0 ? '최근 365일 동안 학습 기록이 없어요.' : '날짜에 마우스를 올리거나 키보드 포커스를 두면 기록 개수를 확인할 수 있어요.'}</p>
      <ul className="study-heatmap__legend" aria-label="학습 기록 개수별 색상 범례">
        {[0, 1, 2, 3, 4].map((level) => <li key={level}><span className="study-heatmap__swatch" data-level={level} aria-hidden="true" />{level === 4 ? '4개 이상' : level + '개'}</li>)}
      </ul>
    </section>
  )
}
