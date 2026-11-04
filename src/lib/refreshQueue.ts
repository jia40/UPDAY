// Each screen owns a queue. Invalidating detaches an old read immediately so a
// mutation's follow-up read never waits for, or publishes, the pre-write result.
export function createRefreshQueue() {
  let load: (isCurrent: () => boolean) => Promise<void> = async () => {}
  let blocked = false
  let active = false
  let generation = 0
  let flight: Promise<void> | undefined
  let queued = false
  function request(force = false): Promise<void> {
    if (!active) return Promise.resolve()
    if (flight) return flight
    if (!force && blocked) { queued = true; return Promise.resolve() }
    queued = false
    const version = generation
    const isCurrent = () => active && version === generation
    const running = Promise.resolve().then(() => { if (isCurrent()) return load(isCurrent) }).finally(() => {
      if (flight !== running) return
      flight = undefined
      if (queued && !blocked) void request()
    })
    flight = running
    return running
  }
  return {
    request,
    configure(nextLoad: typeof load, paused: boolean) { load = nextLoad; blocked = paused },
    invalidate() { generation++; flight = undefined; queued = true },
    start() { active = true; void request() },
    stop() { active = false; generation++; flight = undefined; queued = false },
    flush() { if (queued && !blocked) void request() },
  }
}
