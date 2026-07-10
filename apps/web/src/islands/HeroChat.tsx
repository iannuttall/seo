/** @jsxImportSource react */
import { SiClaude } from '@icons-pack/react-simple-icons'
import { CheckIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

/**
 * A scripted example of an agent using real SEO CLI commands. The numbers are
 * example data. Claims stay bounded to what each report can actually observe.
 */
const CLAUDE_ORANGE = '#D97757'

type Chart = { data: { label: string; value: number }[]; highlight?: number[] }

type Msg = {
  role: 'user' | 'agent'
  text?: string
  /** SEO commands this turn runs, shown inline then collapsed. */
  tools?: string[]
  bullets?: string[]
  chart?: Chart
  draft?: { text: string; note: string }
  action?: string
}

const SCRIPT: Msg[] = [
  { role: 'user', text: 'What should I fix first on example.com?' },
  {
    role: 'agent',
    tools: [
      'seo report --project example',
      'seo refresh-priorities --project example',
    ],
    text: 'I ran the main report, then ranked the follow-up work. Three fixes lead the queue, and each one is tied to pages that already earn impressions.',
    bullets: [
      '17 indexable URLs canonical to a redirected page',
      '6 URLs with Search Console clicks now return 404',
      '9 retained queries average positions 10 to 20',
    ],
  },
  { role: 'user', text: 'Show me the quickest wins.' },
  {
    role: 'agent',
    tools: ['seo quick-wins --project example'],
    text: "Quick wins found retained position 4 to 10 rows below this site's own CTR benchmark. They are review candidates, not guaranteed traffic gains. One page stands out.",
    chart: {
      data: [
        { label: 'Expected', value: 100 },
        { label: 'Actual', value: 61 },
      ],
      highlight: [0],
    },
    bullets: [
      '/pricing averages position 4.2 and sits below the benchmark',
      'The live title repeats the brand phrase',
      'The report includes the exact queries, dates, and benchmark',
    ],
  },
  { role: 'user', text: 'Anything stuck on page two?' },
  {
    role: 'agent',
    tools: ['seo second-page --project example'],
    text: 'Second page found retained queries averaging positions 10 to 20 with steady impressions. Most map to two guides, giving us a small set of pages to inspect.',
    bullets: [
      '8 queries cluster around two guide pages',
      'The fetched pages miss several retained query themes',
      'Impressions held steady in the compared 90-day window',
    ],
  },
  { role: 'user', text: 'Is anything broken technically?' },
  {
    role: 'agent',
    tools: ['seo technical-watch --project example', 'seo crawl-diff'],
    text: "The crawl found a new noindex change after last week's deploy. It needs an intent check before we call it a defect.",
    bullets: [
      '14 tag pages gained a noindex meta tag',
      '31 crawled URLs are absent from the sitemap, which may be intentional',
      'Index Watch can inspect a bounded sample of Google snapshots',
    ],
  },
  { role: 'user', text: 'Trace what broke on /blog/old-guide.' },
  {
    role: 'agent',
    tools: [
      'seo redirect-trace --url https://example.com/blog/old-guide',
      'seo url-inspect --project example --url https://example.com/guide',
    ],
    text: 'It is a three-hop chain that ends on a page marked noindex. Google reports the destination as excluded, but the report does not assume either choice was accidental.',
    draft: {
      text: '/blog/old-guide -> /guide?ref=old -> /guide (noindex)\n\nConfirm the intended destination and index state before changing either.',
      note: 'Review the observed chain and directive',
    },
    action: 'Evidence kept with the affected URLs',
  },
  { role: 'user', text: 'How ready am I for AI search?' },
  {
    role: 'agent',
    tools: ['seo ai-readiness --project example', 'seo llms audit'],
    text: 'I found no crawl, indexability, or snippet-control conflict in the inspected pages. That supports technical eligibility, not inclusion or citations.',
    bullets: [
      'Observed structured data is valid on the pages that use it',
      'No llms.txt was found. Google does not require one for AI search',
      'Observed robots and snippet controls do not restrict Google Search',
    ],
  },
  { role: 'user', text: 'Did the redirect fix actually help?' },
  {
    role: 'agent',
    tools: [
      'seo change-log measure --id redirect-fix',
      'seo tests report --id redirect-test',
    ],
    text: 'Change Log measured the window around your fix, and SEO Tests compared the changed pages against a control group. The movement is positive, with the usual non-causal caveat.',
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
  { role: 'user', text: 'Give me the monthly summary to send.' },
  {
    role: 'agent',
    tools: ['seo monthly-report --project example'],
    text: 'Done. It reads as plain English, keeps every number tied to its source, and flags sections where the data was too sparse to call.',
    action: 'Monthly report rendered as Markdown',
  },
]

const INIT = 2 // first turn (user + agent) shown on load, untyped
const ALL_BULLETS = Number.POSITIVE_INFINITY
const APPEAR = 'animate-[fade-slide-in_0.4s_ease-out]'

function ThinkingDots() {
  return (
    <span className="grid grid-cols-3 gap-[3px]">
      {[1.4, 1.1, 1.6, 1.3, 1.8, 1, 1.5, 1.2, 1.7].map((d, i) => (
        <span
          key={d}
          className="size-[3px] rounded-full bg-muted-foreground"
          style={{
            animation: `braille-pulse ${d}s ease-in-out ${(i % 5) * 0.15}s infinite`,
          }}
        />
      ))}
    </span>
  )
}

function Caret() {
  return (
    <span className="ml-0.5 inline-block h-3.5 w-px translate-y-[2px] animate-pulse bg-current align-baseline" />
  )
}

/** Bars use explicit pixel heights so they render regardless of flex sizing. */
function BarChart({ data, highlight = [] }: Chart) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const TRACK = 92
  return (
    <div className="flex items-end gap-2">
      {data.map((d, i) => {
        const on = highlight.includes(i)
        return (
          <div
            key={d.label}
            className="flex flex-1 flex-col items-center gap-2"
          >
            <div
              className={`w-full rounded-sm ${on ? 'bg-primary' : 'bg-muted-foreground/20'}`}
              style={{
                height: Math.max(6, Math.round((d.value / max) * TRACK)),
              }}
            />
            <span
              className={`text-[10px] ${on ? 'font-medium text-primary' : 'text-muted-foreground'}`}
            >
              {d.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** The inline SEO command runner: one active row while running, then a summary. */
function ToolRun({
  tools,
  active,
  done,
}: {
  tools: string[]
  /** index of the currently running command (only used while not done) */
  active: number
  done: boolean
}) {
  // Once done, the summary sits flush left, aligned with the answer text below.
  // While running, the dots lead the command id.
  if (done) {
    return (
      <div className="flex items-center text-muted-foreground text-sm">
        Ran {tools.length} seo {tools.length === 1 ? 'command' : 'commands'}
      </div>
    )
  }
  const name = tools[Math.min(active, tools.length - 1)]
  return (
    <div className="flex items-center gap-2 text-sm">
      <ThinkingDots />
      <span className="font-mono text-secondary-foreground">{name}</span>
    </div>
  )
}

export function HeroChat() {
  const [shown, setShown] = useState(INIT)
  const [typed, setTyped] = useState<string | null>(null)
  const [extras, setExtras] = useState(true)
  // False only on first load, where the opening turn renders fully untyped.
  // Once the loop starts, the active turn's text follows `typed` so it never
  // flashes the full string before typing.
  const [animating, setAnimating] = useState(false)
  // Active agent turn's command runner. null on user turns / before tools start.
  const [toolRun, setToolRun] = useState<{ idx: number; done: boolean } | null>(
    null,
  )
  // Bullet typing for the active turn: how many are fully shown, plus the one
  // currently typing. ALL_BULLETS means "show every bullet" (initial/historical
  // turns that aren't being typed out).
  const [bulletsShown, setBulletsShown] = useState(ALL_BULLETS)
  const [typedBullet, setTypedBullet] = useState<string | null>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let cancelled = false
    const timers = new Set<number>()
    const sleep = (ms: number) =>
      new Promise<void>((res) => {
        const id = window.setTimeout(() => {
          timers.delete(id)
          res()
        }, ms)
        timers.add(id)
      })

    // One typewriter for any line; bullets reuse it via their own setter so the
    // whole demo types at one steady speed.
    const typeInto = async (full: string, set: (s: string) => void) => {
      for (let i = 1; i <= full.length; i++) {
        if (cancelled) return
        set(full.slice(0, i))
        await sleep(full[i - 1] === ' ' ? 12 : 22)
      }
    }
    const type = (full: string) => typeInto(full, setTyped)

    const play = async () => {
      // Continuous feed: never collapse the list. Reveal the next message and
      // loop through the script by index forever. Only the most recent turns
      // render; older ones fade off the top and unmount, so it reads as one
      // ongoing session rather than restarting.
      let n = INIT
      await sleep(2600)
      setAnimating(true)
      while (!cancelled) {
        const m = SCRIPT[n % SCRIPT.length]
        if (m.role === 'user') {
          setExtras(false)
          setToolRun(null)
          setBulletsShown(0)
          setTypedBullet(null)
          setTyped('')
          setShown(n + 1)
          await type(m.text ?? '')
          await sleep(1000)
        } else {
          setExtras(false)
          setTyped(null)
          setBulletsShown(0)
          setTypedBullet(null)
          setShown(n + 1)
          // Run each SEO command inline, one row replacing the last. A touch
          // slower than reading speed so each one is legible.
          const tools = m.tools ?? []
          for (let i = 0; i < tools.length; i++) {
            if (cancelled) return
            setToolRun({ idx: i, done: false })
            await sleep(950)
          }
          if (cancelled) return
          setToolRun({ idx: tools.length - 1, done: true })
          await sleep(550)
          // Type the answer, then keep typing straight into the bullets so the
          // whole reply reads as one continuous stream (no pop-in, no gap). The
          // chart fades in alongside the bullets on chart turns.
          setTyped('')
          await type(m.text ?? '')
          setExtras(true)
          const bullets = m.bullets ?? []
          if (bullets.length > 0) {
            for (let bi = 0; bi < bullets.length; bi++) {
              if (cancelled) return
              setBulletsShown(bi)
              setTypedBullet('')
              await typeInto(bullets[bi], setTypedBullet)
              setTypedBullet(null)
              setBulletsShown(bi + 1)
              await sleep(160)
            }
          } else {
            setBulletsShown(ALL_BULLETS)
          }
          const dwell = 1600 + (m.chart ? 900 : 0) + (m.draft ? 2400 : 0)
          await sleep(dwell)
        }
        n++
      }
    }

    play()
    return () => {
      cancelled = true
      for (const id of timers) clearTimeout(id)
    }
  }, [])

  // Render only the most recent turns; older ones have faded off the top.
  const WINDOW = 9
  const indices: number[] = []
  for (let a = Math.max(0, shown - WINDOW); a < shown; a++) indices.push(a)

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_8px_44px_-12px_rgba(0,0,0,0.1)]"
      style={{ contain: 'layout' }}
    >
      {/* Title bar, no divider line, kept clean */}
      <div className="flex items-center gap-3 px-6 py-4">
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-border" />
          <span className="size-3 rounded-full bg-border" />
          <span className="size-3 rounded-full bg-border" />
        </div>
        <span className="text-muted-foreground text-sm font-medium">
          Example SEO audit agent
        </span>
      </div>

      {/* Conversation, bottom-anchored, latest turn stays in view. The top
          fades out so scrolled-up turns don't hard-cut.
          `overflowAnchor: none` excludes this churning feed from Chrome's
          scroll-anchoring, so adding/removing turns can't nudge page scrollY. */}
      <div
        className="flex h-[360px] flex-col justify-end gap-7 overflow-hidden px-6 pt-10 pb-8"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0, #000 64px)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0, #000 64px)',
          overflowAnchor: 'none',
        }}
      >
        {indices.map((a) => {
          const m = SCRIPT[a % SCRIPT.length]
          const isActive = a === shown - 1
          const full = m.text ?? ''
          // Non-active turns show full text. The active turn shows the typed
          // slice once animating (empty while a command runs), or the full text
          // on the untyped first-load turn. The line is never cleared, so once
          // the typed slice reaches the full text it just stays put.
          const text = !isActive ? m.text : animating ? (typed ?? '') : full
          // Caret only while this line is still mid-type (a strict prefix).
          const typingNow =
            isActive && animating && typed !== null && typed !== full
          const showExtras = !isActive || extras
          const key = a

          if (m.role === 'user') {
            return (
              <div key={key} className={`flex gap-3 ${APPEAR}`}>
                <span className="mt-0.5 size-5 shrink-0 rounded-full bg-muted" />
                <p className="text-foreground text-sm leading-relaxed">
                  {text}
                  {typingNow && <Caret />}
                </p>
              </div>
            )
          }

          // While the active agent turn is still running its commands, show only
          // the inline runner; hold the answer until they finish.
          const running = isActive && toolRun !== null && !toolRun.done
          const tools = m.tools ?? []

          return (
            <div key={key} className={`flex gap-3 ${APPEAR}`}>
              <SiClaude
                className="mt-0.5 size-5 shrink-0"
                color={CLAUDE_ORANGE}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-4">
                {tools.length > 0 ? (
                  <ToolRun
                    tools={tools}
                    active={
                      isActive && toolRun ? toolRun.idx : tools.length - 1
                    }
                    done={!isActive || (toolRun?.done ?? true)}
                  />
                ) : null}

                {!running && (
                  <div className="flex flex-col gap-3.5">
                    {text ? (
                      <p className="text-secondary-foreground text-sm leading-relaxed">
                        {text}
                        {typingNow && <Caret />}
                      </p>
                    ) : null}

                    {showExtras && m.chart ? (
                      <div className={APPEAR}>
                        <BarChart
                          data={m.chart.data}
                          highlight={m.chart.highlight}
                        />
                      </div>
                    ) : null}

                    {showExtras && m.bullets ? (
                      <ul className="flex flex-col gap-2">
                        {m.bullets.map((b, bi) => {
                          // On the active turn, reveal bullets as they type; the
                          // one at `bulletsShown` is mid-type, later ones wait.
                          const typingThis =
                            isActive &&
                            bi === bulletsShown &&
                            typedBullet !== null
                          if (isActive && !typingThis && bi >= bulletsShown) {
                            return null
                          }
                          return (
                            <li
                              key={b}
                              className="flex items-start gap-2.5 text-sm"
                            >
                              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                              <span className="text-secondary-foreground">
                                {typingThis ? typedBullet : b}
                                {typingThis && <Caret />}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    ) : null}

                    {showExtras && m.draft ? (
                      <div className={`rounded-lg bg-muted/60 p-4 ${APPEAR}`}>
                        <p className="whitespace-pre-line font-mono text-foreground text-xs leading-relaxed">
                          {m.draft.text}
                        </p>
                        <p className="mt-3 text-muted-foreground text-xs">
                          {m.draft.note}
                        </p>
                      </div>
                    ) : null}

                    {showExtras && m.action ? (
                      <div
                        className={`flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary text-sm ${APPEAR}`}
                      >
                        <CheckIcon weight="bold" className="size-3.5" />
                        {m.action}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
