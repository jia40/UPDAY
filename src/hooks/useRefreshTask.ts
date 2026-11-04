import { useEffect, useState } from 'react'
import { createRefreshQueue } from '../lib/refreshQueue'

export function useRefreshTask(load: (isCurrent: () => boolean) => Promise<void>, paused = false) {
  const [queue] = useState(createRefreshQueue)
  useEffect(() => { queue.configure(load, paused) }, [queue, load, paused])
  useEffect(() => {
    queue.start()
    return () => queue.stop()
  }, [queue, load])
  useEffect(() => { if (!paused) queue.flush() }, [queue, paused])
  return queue
}
