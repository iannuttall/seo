/**
 * Behavior for the /guides/seo-agent interactive demos. Alpine is loaded here,
 * on this page only. Server-rendered markup is the no-JS state, so every
 * component below starts from what is already on screen.
 */
import Alpine from 'alpinejs'

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readJson<T>(element: HTMLElement, name: string, fallback: T): T {
  const raw = element.dataset[name]
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** 01 / The evidence. Connect and disconnect the four sources. */
Alpine.data('evidenceSources', () => ({
  sources: { crawl: true, gsc: true, analytics: true, live: true } as Record<
    string,
    boolean
  >,
  toggle(key: string) {
    this.sources[key] = !this.sources[key]
  },
  connected(): number {
    return Object.values(this.sources).filter(Boolean).length
  },
  allOff(): boolean {
    return this.connected() === 0
  },
  caption(): string {
    const count = this.connected()
    if (count === 4)
      return 'All four sources connected. Every claim below names the evidence behind it.'
    if (count === 0)
      return 'No sources connected. The advice does not stop, but the evidence did.'
    return `${count} of 4 sources connected. The missing claims are not wrong, they are unknowable.`
  },
}))

/**
 * 02 / The loop. A closed five-station circuit. While playing, the orange leg
 * between the current station and the next one draws itself in, the next
 * station lights up, the finished leg fades, and the loop keeps going.
 */
Alpine.data('loopCircuit', () => ({
  branch: 'problem' as 'problem' | 'opportunity',
  step: -1,
  playing: false,
  count: 5,
  legs: [] as SVGPathElement[],
  lengths: [] as number[],
  raf: 0,
  holdTimer: 0 as ReturnType<typeof setTimeout> | 0,
  fadeTimer: 0 as ReturnType<typeof setTimeout> | 0,
  resetTimer: 0 as ReturnType<typeof setTimeout> | 0,
  interval: 0 as ReturnType<typeof setInterval> | 0,
  captions: { problem: [] as string[], opportunity: [] as string[] },
  idleCaption: '',
  init() {
    const root = this.$root as HTMLElement
    this.captions = readJson(root, 'captions', this.captions)
    this.idleCaption = root.dataset.idleCaption ?? ''
    this.legs = Array.from(
      root.querySelectorAll<SVGPathElement>('[data-leg-draw]'),
    )
    this.count = this.legs.length || 5
    for (const leg of this.legs) {
      const length = leg.getTotalLength()
      this.lengths.push(length)
      leg.style.strokeDasharray = `${length}`
      leg.style.strokeDashoffset = `${length}`
    }
  },
  caption(): string {
    if (this.step < 0) return this.idleCaption
    return this.captions[this.branch][this.step] ?? ''
  },
  setBranch(branch: 'problem' | 'opportunity') {
    this.branch = branch
    if (this.step < 0 && !this.playing) this.step = 0
  },
  advance() {
    this.step = this.step < 0 ? 0 : (this.step + 1) % this.count
  },
  next() {
    this.stopAnimation()
    this.playing = false
    this.advance()
  },
  goto(index: number) {
    this.stopAnimation()
    this.playing = false
    this.step = index
  },
  play() {
    if (this.playing) {
      this.pause()
      return
    }
    this.playing = true
    if (reducedMotion()) {
      this.advance()
      this.interval = setInterval(() => this.advance(), 4000)
      return
    }
    if (this.step < 0) this.step = 0
    this.runLeg()
  },
  runLeg() {
    if (!this.playing) return
    const from = this.step
    const leg = this.legs[from]
    const length = this.lengths[from]
    if (!leg) return
    // The station lights and its outgoing line draws at constant speed for
    // four seconds. The moment the line touches the next box, that box floods
    // orange from the entry point. Then, like the keep guide's ring, the
    // finished line pulls its tail into the box it reached, and only after
    // that does the next line start.
    const duration = 4000
    const retractDuration = 700
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      leg.style.strokeDashoffset = String(length * (1 - t))
      if (t < 1) {
        this.raf = requestAnimationFrame(tick)
        return
      }
      this.step = (from + 1) % this.count
      const retractStart = performance.now()
      const retract = (now2: number) => {
        const rt = Math.min(1, (now2 - retractStart) / retractDuration)
        leg.style.strokeDashoffset = String(-length * rt)
        if (rt < 1) {
          this.raf = requestAnimationFrame(retract)
          return
        }
        leg.style.strokeDashoffset = `${length}`
        this.runLeg()
      }
      this.raf = requestAnimationFrame(retract)
    }
    this.raf = requestAnimationFrame(tick)
  },
  stopAnimation() {
    if (this.raf) cancelAnimationFrame(this.raf)
    if (this.holdTimer) clearTimeout(this.holdTimer)
    if (this.fadeTimer) clearTimeout(this.fadeTimer)
    if (this.resetTimer) clearTimeout(this.resetTimer)
    if (this.interval) clearInterval(this.interval)
    this.raf = 0
    this.holdTimer = 0
    this.fadeTimer = 0
    this.resetTimer = 0
    this.interval = 0
    this.legs.forEach((leg, index) => {
      leg.style.strokeDashoffset = `${this.lengths[index]}`
      leg.style.opacity = ''
    })
  },
  pause() {
    this.playing = false
    this.stopAnimation()
  },
  destroy() {
    this.pause()
  },
}))

/** 03 / One investigation. Step-through with a conversation and an evidence ledger. */
Alpine.data('investigation', () => ({
  step: 0,
  total: 0,
  playing: false,
  timer: 0 as ReturnType<typeof setInterval> | 0,
  captions: [] as string[],
  idleCaption: '',
  init() {
    const root = this.$root as HTMLElement
    this.captions = readJson(root, 'captions', [])
    this.total = this.captions.length
    this.idleCaption = root.dataset.idleCaption ?? ''
  },
  caption(): string {
    if (this.step === 0) return this.idleCaption
    return this.captions[this.step - 1] ?? ''
  },
  done(): boolean {
    return this.step >= this.total
  },
  scrollPanes() {
    this.$nextTick(() => {
      for (const pane of [this.$refs.conversation, this.$refs.ledger]) {
        if (pane) pane.scrollTop = pane.scrollHeight
      }
    })
  },
  next() {
    if (this.done()) {
      this.pause()
      return
    }
    this.step += 1
    this.scrollPanes()
    if (this.done()) this.pause()
  },
  play() {
    if (this.playing) {
      this.pause()
      return
    }
    if (this.done()) this.reset()
    this.playing = true
    this.next()
    this.timer = setInterval(() => this.next(), reducedMotion() ? 3200 : 2600)
  },
  pause() {
    this.playing = false
    if (this.timer) clearInterval(this.timer)
    this.timer = 0
  },
  reset() {
    this.pause()
    this.step = 0
  },
  destroy() {
    this.pause()
  },
}))

/** 04 / Data states. One question, five states of the same evidence. */
Alpine.data('dataStates', () => ({
  state: 'complete',
  pick(state: string) {
    this.state = state
  },
}))

type QueueRow = {
  status: 'proposed' | 'approved' | 'skipped'
  open: boolean
  narrowed: boolean
}

/** 05 / The approval queue. Inspect, narrow, approve, or skip each change. */
Alpine.data('approvalQueue', () => ({
  rows: {} as Record<string, QueueRow>,
  init() {
    const root = this.$root as HTMLElement
    for (const id of (root.dataset.rows ?? '').split(',').filter(Boolean)) {
      this.rows[id] = { status: 'proposed', open: false, narrowed: false }
    }
  },
  pending(): number {
    return Object.values(this.rows).filter((row) => row.status === 'proposed')
      .length
  },
  approvedCount(): number {
    return Object.values(this.rows).filter((row) => row.status === 'approved')
      .length
  },
  skippedCount(): number {
    return Object.values(this.rows).filter((row) => row.status === 'skipped')
      .length
  },
  summary(): string {
    if (this.pending() > 0) {
      const decided = this.approvedCount() + this.skippedCount()
      if (decided === 0)
        return 'Four proposed changes are waiting on you. The agent works through the approved list only.'
      return `${this.pending()} still waiting. Approved so far: ${this.approvedCount()}. Skipped: ${this.skippedCount()}.`
    }
    return `Queue clear. ${this.approvedCount()} approved, ${this.skippedCount()} skipped. The agent now acts on the approved list, and nothing else.`
  },
  toggleInspect(id: string) {
    this.rows[id].open = !this.rows[id].open
  },
  narrow(id: string) {
    this.rows[id].narrowed = true
  },
  approve(id: string) {
    this.rows[id].status = 'approved'
    this.rows[id].open = false
  },
  skip(id: string) {
    this.rows[id].status = 'skipped'
    this.rows[id].open = false
  },
  reset() {
    for (const row of Object.values(this.rows)) {
      row.status = 'proposed'
      row.open = false
      row.narrowed = false
    }
  },
}))

/** 06 / Measurement. Move the change date, keep the windows equal and final. */
Alpine.data('measureWindows', () => ({
  changeDay: 42,
  windowLength: 21,
  notFinalDays: 3,
  clicks: [] as number[],
  init() {
    const root = this.$root as HTMLElement
    this.clicks = readJson(root, 'clicks', [])
    this.changeDay = Number(root.dataset.changeDay ?? 42)
    this.windowLength = Number(root.dataset.windowLength ?? 21)
    this.notFinalDays = Number(root.dataset.notFinalDays ?? 3)
    this.paint()
    this.$watch('changeDay', () => this.paint())
  },
  finalDays(): number {
    return this.clicks.length - this.notFinalDays
  },
  afterComplete(): boolean {
    return this.changeDay + this.windowLength <= this.finalDays()
  },
  beforeTotal(): number {
    let total = 0
    for (
      let day = this.changeDay - this.windowLength;
      day < this.changeDay;
      day += 1
    ) {
      total += this.clicks[day] ?? 0
    }
    return total
  },
  afterTotal(): number {
    let total = 0
    for (
      let day = this.changeDay;
      day < this.changeDay + this.windowLength;
      day += 1
    ) {
      total += this.clicks[day] ?? 0
    }
    return total
  },
  change(): string {
    const before = this.beforeTotal()
    if (before === 0) return '0%'
    const delta = ((this.afterTotal() - before) / before) * 100
    const rounded = Math.round(delta)
    return `${rounded > 0 ? '+' : ''}${rounded}%`
  },
  readout(): string {
    if (!this.afterComplete()) {
      const missing = this.changeDay + this.windowLength - this.finalDays()
      return `The after window is not complete. ${missing} more final ${missing === 1 ? 'day is' : 'days are'} needed before a fair comparison exists.`
    }
    return `Before: ${this.beforeTotal().toLocaleString('en-GB')} clicks. After: ${this.afterTotal().toLocaleString('en-GB')} clicks. Observed change: ${this.change()}.`
  },
  zone(day: number): string {
    if (day >= this.finalDays()) return 'notfinal'
    if (day >= this.changeDay - this.windowLength && day < this.changeDay)
      return 'before'
    if (day >= this.changeDay && day < this.changeDay + this.windowLength) {
      return this.afterComplete() ? 'after' : 'incomplete'
    }
    return 'out'
  },
  paint() {
    const bars = (this.$root as HTMLElement).querySelectorAll<SVGRectElement>(
      '[data-day]',
    )
    for (const bar of bars) {
      bar.setAttribute('data-zone', this.zone(Number(bar.dataset.day)))
    }
  },
}))

declare global {
  interface Window {
    Alpine?: typeof Alpine
  }
}

if (!window.Alpine) {
  window.Alpine = Alpine
  Alpine.start()
}
