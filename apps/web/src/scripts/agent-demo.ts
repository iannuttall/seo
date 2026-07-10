import Alpine from 'alpinejs'

/**
 * Home page showpiece: a window that plays a scripted agent session on loop.
 * Claude drives the real seo CLI. Every command shown is a real command from
 * the shipped catalog; the numbers are example data and the panel is labelled
 * that way. The first turn renders on load; everything after types out.
 *
 * Each agent turn runs a short sequence of seo commands inline (one row at a
 * time, like a real agent), then collapses them into a single summary so the
 * answer reads as grounded in output rather than invented.
 */

type Chart = { data: { label: string; value: number }[]; highlight?: number[] }

type Msg = {
  role: 'user' | 'agent'
  text?: string
  /** seo commands this turn runs, shown inline then collapsed to a summary. */
  tools?: string[]
  bullets?: string[]
  chart?: Chart
  card?: { title: string; body: string; mono?: boolean }
  action?: string
}

const SCRIPT: Msg[] = [
  { role: 'user', text: 'What should I fix first on example.com?' },
  {
    role: 'agent',
    tools: ['seo report --project example', 'seo refresh-priorities'],
    text: 'I ran the main report, then ranked the follow-up work. Three fixes lead the queue, and each one is tied to pages that already earn impressions.',
    bullets: [
      '17 indexable URLs canonical to a redirected page',
      '6 URLs with Search Console clicks now return 404',
      '9 queries sit on page two within reach of page one',
    ],
  },
  { role: 'user', text: 'Show me the quickest wins.' },
  {
    role: 'agent',
    tools: ['seo quick-wins --project example'],
    text: 'Quick wins looks for pages ranking in positions 4 to 10 that earn fewer clicks than pages at that position usually do. One page stands out.',
    chart: {
      data: [
        { label: 'Expected', value: 100 },
        { label: 'Actual', value: 58 },
      ],
      highlight: [0],
    },
    bullets: [
      '/pricing averages position 4.2 with the CTR of a position 9',
      'Its title repeats the brand and misses the query wording',
      'The report lists the exact queries and dates behind the math',
    ],
  },
  { role: 'user', text: 'Anything stuck on page two?' },
  {
    role: 'agent',
    tools: ['seo second-page --project example'],
    text: 'Second page found queries averaging positions 10 to 20 with steady impressions. Most map to two guides that cover the topic thinner than the pages above them.',
    bullets: [
      '8 queries cluster around two /guides posts',
      'Both rank for the head term but none of the follow-up questions',
      'Impressions held steady for 90 days, so the demand is there',
    ],
  },
  { role: 'user', text: 'Is anything broken technically?' },
  {
    role: 'agent',
    tools: ['seo technical-watch --project example', 'seo crawl-diff'],
    text: "The crawl found a noindex regression, and the diff pins it to last week's deploy.",
    bullets: [
      '14 tag pages gained a noindex meta tag since the last crawl',
      '31 crawled URLs are missing from the sitemap',
      'seo index-watch can confirm how Google sees each one',
    ],
  },
  { role: 'user', text: 'Trace what happened to /blog/old-guide.' },
  {
    role: 'agent',
    tools: ['seo redirect-trace --url /blog/old-guide', 'seo url-inspect'],
    text: 'It is a three-hop chain that ends on a page marked noindex, which is why it dropped out of the index.',
    card: {
      title: 'Fix',
      body: '/blog/old-guide -> /guide?ref=old -> /guide (noindex)\n\n301 straight to /guide and drop the noindex tag',
      mono: true,
    },
    action: 'Logged in the change log for before and after',
  },
  { role: 'user', text: 'How ready is the site for AI search?' },
  {
    role: 'agent',
    tools: ['seo ai-readiness --project example', 'seo llms audit'],
    text: 'Crawlable and fast, but thin on machine-readable structure. The evidence is listed per page, so an agent can work through it file by file.',
    bullets: [
      'No structured data on 80% of the articles',
      'No llms.txt yet. seo llms generate drafts one from the crawl',
      'robots.txt currently allows the major AI crawlers',
    ],
  },
  { role: 'user', text: "Did last month's fixes actually help?" },
  {
    role: 'agent',
    tools: ['seo change-log --project example', 'seo tests'],
    text: 'The change log measured the window around each fix and compared it with a control group of untouched pages. The movement is positive, with the usual caveat that this is correlation.',
    chart: {
      data: [
        { label: 'Before', value: 100 },
        { label: 'After', value: 128 },
      ],
      highlight: [1],
    },
    bullets: [
      'Changed pages earned 28% more clicks than the prior 14 days',
      'The control group held flat over the same window',
    ],
  },
  { role: 'user', text: 'Write the monthly summary for the client.' },
  {
    role: 'agent',
    tools: ['seo monthly-report --project example'],
    text: 'Done. It reads as plain English, keeps every number tied to its source, and flags the sections where the data was too sparse to call.',
    action: 'Monthly report saved as Markdown',
  },
]

const INIT = 2 // first turn (user + agent) shown on load, untyped
const ALL_BULLETS = Number.POSITIVE_INFINITY
const WINDOW = 9

Alpine.data('agentDemo', () => ({
  shown: INIT,
  typed: null as string | null,
  extras: true,
  // False only on first load, where the opening turn renders fully untyped.
  animating: false,
  toolRun: null as { idx: number; done: boolean } | null,
  bulletsShown: ALL_BULLETS,
  typedBullet: null as string | null,
  cancelled: false,
  timers: new Set<number>(),

  get indices(): number[] {
    const out: number[] = []
    for (let a = Math.max(0, this.shown - WINDOW); a < this.shown; a++) {
      out.push(a)
    }
    return out
  },

  msg(a: number): Msg {
    return SCRIPT[a % SCRIPT.length] as Msg
  },
  isActive(a: number): boolean {
    return a === this.shown - 1
  },
  running(a: number): boolean {
    return (
      this.isActive(a) &&
      this.msg(a).role === 'agent' &&
      this.toolRun !== null &&
      !this.toolRun.done
    )
  },
  textFor(a: number): string {
    const full = this.msg(a).text ?? ''
    if (!this.isActive(a)) return full
    return this.animating ? (this.typed ?? '') : full
  },
  typingNow(a: number): boolean {
    return (
      this.isActive(a) &&
      this.animating &&
      this.typed !== null &&
      this.typed !== (this.msg(a).text ?? '')
    )
  },
  showExtras(a: number): boolean {
    return !this.isActive(a) || this.extras
  },
  toolDone(a: number): boolean {
    return !this.isActive(a) || (this.toolRun?.done ?? true)
  },
  activeTool(a: number): string {
    const tools = this.msg(a).tools ?? []
    const idx =
      this.isActive(a) && this.toolRun ? this.toolRun.idx : tools.length - 1
    return tools[Math.min(idx, tools.length - 1)] ?? ''
  },
  toolSummary(a: number): string {
    const count = (this.msg(a).tools ?? []).length
    return `Ran ${count} seo ${count === 1 ? 'command' : 'commands'}`
  },
  barHeight(a: number, i: number): string {
    const chart = this.msg(a).chart
    if (!chart) return '0px'
    const max = Math.max(...chart.data.map((d) => d.value), 1)
    const value = chart.data[i]?.value ?? 0
    return `${Math.max(6, Math.round((value / max) * 92))}px`
  },
  barOn(a: number, i: number): boolean {
    return (this.msg(a).chart?.highlight ?? []).includes(i)
  },
  bulletTyping(a: number, bi: number): boolean {
    return (
      this.isActive(a) && bi === this.bulletsShown && this.typedBullet !== null
    )
  },
  bulletVisible(a: number, bi: number): boolean {
    if (!this.isActive(a)) return true
    return bi < this.bulletsShown || this.bulletTyping(a, bi)
  },
  bulletText(a: number, bi: number): string {
    if (this.bulletTyping(a, bi)) return this.typedBullet ?? ''
    return this.msg(a).bullets?.[bi] ?? ''
  },

  async init() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(() => {
          this.timers.delete(id)
          resolve()
        }, ms)
        this.timers.add(id)
      })

    // One typewriter for any line; bullets reuse it via their own setter so
    // the whole demo types at one steady speed.
    const typeInto = async (full: string, set: (s: string) => void) => {
      for (let i = 1; i <= full.length; i++) {
        if (this.cancelled) return
        set(full.slice(0, i))
        await sleep(full[i - 1] === ' ' ? 12 : 22)
      }
    }

    // Continuous feed: reveal the next message and loop through the script by
    // index forever. Only the most recent turns render; older ones fade off
    // the top and unmount, so it reads as one ongoing session.
    let n = INIT
    await sleep(2600)
    this.animating = true
    while (!this.cancelled) {
      const m = SCRIPT[n % SCRIPT.length] as Msg
      if (m.role === 'user') {
        this.extras = false
        this.toolRun = null
        this.bulletsShown = 0
        this.typedBullet = null
        this.typed = ''
        this.shown = n + 1
        await typeInto(m.text ?? '', (s) => {
          this.typed = s
        })
        await sleep(1000)
      } else {
        this.extras = false
        this.typed = null
        this.bulletsShown = 0
        this.typedBullet = null
        this.shown = n + 1
        // Run each seo command inline, one row replacing the last. A touch
        // slower than reading speed so each one is legible.
        const tools = m.tools ?? []
        for (let i = 0; i < tools.length; i++) {
          if (this.cancelled) return
          this.toolRun = { idx: i, done: false }
          await sleep(950)
        }
        if (this.cancelled) return
        this.toolRun = { idx: tools.length - 1, done: true }
        await sleep(550)
        // Type the answer, then keep typing straight into the bullets so the
        // whole reply reads as one continuous stream.
        this.typed = ''
        await typeInto(m.text ?? '', (s) => {
          this.typed = s
        })
        this.extras = true
        const bullets = m.bullets ?? []
        if (bullets.length > 0) {
          for (let bi = 0; bi < bullets.length; bi++) {
            if (this.cancelled) return
            this.bulletsShown = bi
            this.typedBullet = ''
            await typeInto(bullets[bi] ?? '', (s) => {
              this.typedBullet = s
            })
            this.typedBullet = null
            this.bulletsShown = bi + 1
            await sleep(160)
          }
        } else {
          this.bulletsShown = ALL_BULLETS
        }
        await sleep(1600 + (m.chart ? 900 : 0) + (m.card ? 2400 : 0))
      }
      n++
    }
  },

  destroy() {
    this.cancelled = true
    for (const id of this.timers) clearTimeout(id)
  },
}))

Alpine.start()
