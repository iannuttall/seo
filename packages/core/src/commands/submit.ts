import {
  INDEXMYSITE_MAX_URLS,
  type IndexMySiteApi,
  type IndexMySiteJob,
  jobKey,
} from '../indexing/indexmysite.js'
import {
  checkKeyFile,
  INDEXNOW_MAX_URLS,
  indexNowHost,
  keyFileUrl,
  newIndexNowKey,
  submitIndexNow,
  validIndexNowKey,
} from '../indexing/indexnow.js'
import { table } from './present.js'
import {
  type Caller,
  type CommandDeps,
  CommandError,
  type CommandResult,
} from './types.js'

// seo submit: ask search engines to crawl pages. IndexNow is free and
// reaches Bing, Yandex and other engines, not Google. Index My Site is a
// paid service, connected with OAuth to the person's own account, that
// sends URLs to Google, checks each one and gives a credit back for pages
// Google has not indexed by its final check. Worker-safe.

export const SUBMIT_ACTIONS = [
  'indexnow_key',
  'indexnow',
  'indexmysite',
  'indexmysite_status',
  'indexmysite_approve',
  'indexmysite_connect',
] as const

export type SubmitAction = (typeof SUBMIT_ACTIONS)[number]

export const SUBMIT_HELP = `indexnow_key (site: makes or reuses this site's IndexNow key, says which file to serve and checks whether it is live; key: use a key the site already serves), indexnow (urls on one host: checks the key file, then sends them to IndexNow, free; reaches Bing, Yandex, Seznam, Naver and Yep, not Google), indexmysite (urls, up to ${INDEXMYSITE_MAX_URLS.toLocaleString('en-US')}: Index My Site, paid with the person's own credits, sends them to Google, checks each after 24 hours and gives a credit back for each page Google has not indexed by the final check around day 14. Without confirm it only returns the cost and the balance and sends nothing; show the person that cost, then call again with confirm true. bing also sends each URL to Bing for 1 more credit, fast asks for faster Google indexing for 1 more; neither extra credit comes back. Use them only when the person asks), indexmysite_status (credits and recent jobs; with job_id every URL's status and what happens next), indexmysite_approve (job_id and url_ids or all: approves URLs held for review because little main content was found; costs credits, so confirm works as for indexmysite), indexmysite_connect (connects the person's Index My Site account with a browser sign-in).`

export type SubmitInput = {
  action: SubmitAction
  site?: string
  urls?: string[]
  key?: string
  fast?: boolean
  bing?: boolean
  name?: string
  jobId?: string
  urlIds?: string[]
  all?: boolean
  confirm?: boolean
}

// What seo submit needs from its surface: where IndexNow keys are kept,
// and the person's Index My Site connection.
export type SubmitAccess = {
  indexNowKey: (host: string) => Promise<string | null>
  saveIndexNowKey: (host: string, key: string) => Promise<void>
  // The person's Index My Site account with a current token, or null when
  // it is not connected here.
  indexMySite: () => Promise<IndexMySiteApi | null>
  // Starts connecting Index My Site (or says how), as text for the agent.
  connectIndexMySite: () => Promise<string>
  // How to connect Index My Site on this surface, for not-connected errors.
  indexMySiteConnect: string
  // Fetch for the key file check and IndexNow, where a surface sets one.
  fetch?: typeof fetch
  // Why this surface can't send to IndexNow, when it can't. The key steps
  // still work, and sending points to the CLI or Index My Site's Bing.
  indexNowBlocked?: string
}

const n = (value: number) => value.toLocaleString('en-US')
const plural = (count: number, word: string) =>
  `${n(count)} ${word}${count === 1 ? '' : 's'}`

// Absolute http(s) URLs in their first order, without repeats.
function cleanUrls(urls: string[] | undefined, max: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const bad: string[] = []
  for (const raw of urls ?? []) {
    let url: URL
    try {
      url = new URL(raw.trim())
    } catch {
      bad.push(raw)
      continue
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      bad.push(raw)
      continue
    }
    url.hash = ''
    const href = url.toString()
    if (seen.has(href)) continue
    seen.add(href)
    out.push(href)
  }
  if (bad.length) {
    throw new CommandError(
      'INVALID_INPUT',
      `Not a full http or https URL: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? ` and ${n(bad.length - 3)} more` : ''}.`,
    )
  }
  if (!out.length) {
    throw new CommandError('INVALID_INPUT', 'Give at least one URL in urls.')
  }
  if (out.length > max) {
    throw new CommandError(
      'INVALID_INPUT',
      `${n(out.length)} URLs is more than ${n(max)}, the most one submission takes. Split them.`,
    )
  }
  return out
}

function access(deps: CommandDeps): SubmitAccess {
  if (!deps.submit) {
    throw new CommandError(
      'INVALID_INPUT',
      'Submitting URLs is not available here. Use the seo CLI or the MCP server at https://seoskill.dev/mcp.',
    )
  }
  return deps.submit
}

async function connected(submit: SubmitAccess): Promise<IndexMySiteApi> {
  const ims = await submit.indexMySite()
  if (!ims) {
    throw new CommandError(
      'NOT_CONNECTED',
      `Index My Site is not connected. ${submit.indexMySiteConnect}`,
    )
  }
  return ims
}

export async function runSubmit(
  input: SubmitInput,
  deps: CommandDeps,
): Promise<CommandResult> {
  const submit = access(deps)
  switch (input.action) {
    case 'indexnow_key':
      return indexNowKey(input, submit, deps.call)
    case 'indexnow':
      return indexNow(input, submit, deps.call)
    case 'indexmysite':
      return indexMySite(input, submit, deps)
    case 'indexmysite_status':
      return status(input, submit, deps.call)
    case 'indexmysite_approve':
      return approve(input, submit, deps.call)
    case 'indexmysite_connect': {
      const text = await submit.connectIndexMySite()
      return { text, data: { action: input.action } }
    }
  }
}

// ---- IndexNow ----

function hostOf(site: string | undefined): string {
  const host = site ? indexNowHost(site) : null
  if (!host) {
    throw new CommandError(
      'INVALID_INPUT',
      'Give the site as a host or URL, such as example.com.',
    )
  }
  return host
}

function setupSteps(host: string, key: string, call: Caller): string {
  const url = keyFileUrl(host, key)
  return [
    `To set it up, serve a plain text file at ${url} whose only text is the key, ${key}:`,
    `- With the site's code: save the key as ${key}.txt in the folder the site serves at its root (public/ in Astro, Next.js, Nuxt, Vite and most others; static/ in SvelteKit and Hugo), deploy, then run ${call('submit', { action: 'indexnow_key', site: host })} again to check it.`,
    "- Without the code: upload the file to the site's root folder with the host's file manager or FTP.",
    "- A site that can't serve its own file at the root, such as one on a hosted store or site builder, can't use IndexNow this way. Bing Webmaster Tools' URL submission, or Index My Site's Bing option, still reach Bing.",
    '- If the CMS or CDN already sends IndexNow (such as Cloudflare Crawler Hints or a WordPress SEO plugin with IndexNow on), nothing more is needed for those pages.',
    `Each host has its own key file: example.com and www.example.com are separate.`,
  ].join('\n')
}

async function indexNowKey(
  input: SubmitInput,
  submit: SubmitAccess,
  call: Caller,
): Promise<CommandResult> {
  const host = hostOf(input.site)
  const given = input.key?.trim()
  if (given && !validIndexNowKey(given)) {
    throw new CommandError(
      'INVALID_INPUT',
      'An IndexNow key is 8 to 128 letters, digits or dashes.',
    )
  }
  const saved = await submit.indexNowKey(host)
  const key = given ?? saved ?? newIndexNowKey()
  if (key !== saved) await submit.saveIndexNowKey(host, key)
  const check = await checkKeyFile(host, key, submit.fetch)
  const text = check.live
    ? `IndexNow key for ${host} is live: ${check.url} returns the key. ${
        submit.indexNowBlocked
          ? sendElsewhere(submit.indexNowBlocked, [], call)
          : `Send pages with ${call('submit', { action: 'indexnow' })}.`
      }`
    : `IndexNow key for ${host}: ${key}${saved && key === saved ? ' (saved earlier)' : ' (saved now)'}. Not live yet: ${check.url} ${check.problem}.\n${setupSteps(host, key, call)}`
  return {
    text,
    data: {
      action: 'indexnow_key',
      host,
      key,
      keyFile: check.url,
      keyFileText: key,
      live: check.live,
      status: check.status,
      problem: check.problem,
    },
  }
}

// Where to send pages to IndexNow from a surface that can't.
function sendElsewhere(reason: string, urls: string[], call: Caller): string {
  const cli = !urls.length
    ? 'seo submit <url...>'
    : urls.length <= 3
      ? `seo submit ${urls.join(' ')}`
      : `seo submit --file urls.txt, with the ${n(urls.length)} URLs one per line`
  return `${reason}. Send pages to IndexNow from your own machine with the seo CLI, free: ${cli}. Or send them with Index My Site's Bing option, which reaches Google and Bing for 2 credits a URL: ${call('submit', { action: 'indexmysite', bing: 'true' })}.`
}

async function indexNow(
  input: SubmitInput,
  submit: SubmitAccess,
  call: Caller,
): Promise<CommandResult> {
  const urls = cleanUrls(input.urls, INDEXNOW_MAX_URLS)
  const hosts = [...new Set(urls.map((url) => new URL(url).hostname))]
  if (hosts.length > 1) {
    throw new CommandError(
      'INVALID_INPUT',
      `IndexNow takes one host per submission, and these URLs are on ${hosts.length}: ${hosts.slice(0, 5).join(', ')}. Send each host's URLs separately.`,
    )
  }
  const host = hosts[0] ?? ''
  const given = input.key?.trim()
  if (given && !validIndexNowKey(given)) {
    throw new CommandError(
      'INVALID_INPUT',
      'An IndexNow key is 8 to 128 letters, digits or dashes.',
    )
  }
  const key = given ?? (await submit.indexNowKey(host))
  if (!key) {
    throw new CommandError(
      'NO_KEY',
      `No IndexNow key is saved for ${host}. Run ${call('submit', { action: 'indexnow_key', site: host })} first: it makes the key and says which file to serve.`,
    )
  }
  const check = await checkKeyFile(host, key, submit.fetch)
  if (!check.live) {
    throw new CommandError(
      'INVALID_INPUT',
      `Nothing was sent: the IndexNow key file ${check.url} is not live: it ${check.problem}. Search engines reject URLs until it is.\n${setupSteps(host, key, call)}`,
    )
  }
  if (given && given !== (await submit.indexNowKey(host))) {
    await submit.saveIndexNowKey(host, given)
  }
  if (submit.indexNowBlocked) {
    throw new CommandError(
      'NO_ACCESS',
      `Nothing was sent. ${sendElsewhere(submit.indexNowBlocked, urls, call)}`,
    )
  }
  const result = await submitIndexNow({ host, key, urls }, submit.fetch)
  if (!result.ok) {
    throw new CommandError(
      result.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR',
      `IndexNow did not take the ${plural(urls.length, 'URL')} on ${host}: HTTP ${result.status ?? 'none'}, ${result.meaning}`,
    )
  }
  return {
    text: [
      `IndexNow took ${plural(urls.length, 'URL')} on ${host}: HTTP ${result.status}, ${result.meaning}`,
      'IndexNow shares them with Bing, Yandex, Seznam, Naver and Yep. It reports no per-URL result, and a search engine still decides whether to crawl and index each page.',
      `Google does not use IndexNow. For Google: Request indexing in Search Console's URL Inspection, or Index My Site (paid, indexmysite.app) with ${call('submit', { action: 'indexmysite' })}.`,
    ].join('\n'),
    data: {
      action: 'indexnow',
      host,
      submitted: urls.length,
      status: result.status,
      meaning: result.meaning,
    },
  }
}

// ---- Index My Site ----

function costParts(fast: boolean, bing: boolean): string {
  return [
    '1 for Google',
    fast ? '1 for Fast' : null,
    bing ? '1 for Bing' : null,
  ]
    .filter(Boolean)
    .join(', ')
}

async function indexMySite(
  input: SubmitInput,
  submit: SubmitAccess,
  deps: CommandDeps,
): Promise<CommandResult> {
  const urls = cleanUrls(input.urls, INDEXMYSITE_MAX_URLS)
  const fast = Boolean(input.fast)
  const bing = Boolean(input.bing)
  const name = input.name?.trim() || undefined
  const ims = await connected(submit)
  const perUrl = 1 + Number(fast) + Number(bing)
  const most = urls.length * perUrl
  if (!input.confirm) {
    const credits = await ims.credits()
    const short = credits.balance < most
    return {
      text: [
        `Index My Site quote. Nothing is sent yet.`,
        `${plural(urls.length, 'URL')} × ${perUrl} credit${perUrl === 1 ? '' : 's'} (${costParts(fast, bing)}) = up to ${plural(most, 'credit')}. Balance: ${plural(credits.balance, 'credit')}.${short ? ` URLs beyond the balance wait as awaiting credits until more are bought${credits.autoReloadEnabled ? ' or auto reload tops up' : ''}.` : ''}`,
        'Index My Site checks each URL first and charges only the ones it sends. Redirects, noindex pages, error pages, robots.txt blocks, canonicals that point elsewhere and URLs already in progress in the account are skipped free. Pages with little main content wait for approval.',
        `Credit back: 1 credit for each URL Google has not indexed by the final check, around day 14.${fast || bing ? ` Only the Google credit comes back; the ${[fast ? 'Fast' : null, bing ? 'Bing' : null].filter(Boolean).join(' and ')} credit does not.` : ''}${bing ? ' Bing results are not checked or reported.' : ''}`,
        `Show the person this cost. To send, run ${deps.call('submit', { action: 'indexmysite', confirm: 'true', ...(fast ? { fast: 'true' } : {}), ...(bing ? { bing: 'true' } : {}) })}.`,
      ].join('\n'),
      data: {
        action: 'indexmysite',
        sent: false,
        urls: urls.length,
        creditsPerUrl: perUrl,
        mostCredits: most,
        balance: credits.balance,
        options: { fast, bing },
      },
    }
  }
  const job = await ims.createJob(
    { urls, name, fast, bing },
    await jobKey({ urls, name, fast, bing }, deps.now?.() ?? new Date()),
  )
  return {
    text: jobText(job, deps.call, true),
    data: { action: 'indexmysite', sent: true, job },
  }
}

const STATUS_ORDER = [
  'needs_review',
  'awaiting_credits',
  'skipped',
  'failed',
  'checking_page',
  'queued',
  'funded',
  'submitting',
  'submitted',
  'checking',
  'not_indexed',
  'indexed',
  'refunded',
]

const counted = (counts: Record<string, number>) =>
  Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(
      ([a], [b]) =>
        (STATUS_ORDER.indexOf(a) + 1 || 99) -
          (STATUS_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b),
    )
    .map(([status, count]) => `${status.replaceAll('_', ' ')} ${n(count)}`)
    .join(', ')

const URL_ROWS = 50

function jobText(job: IndexMySiteJob, call: Caller, created: boolean): string {
  const review = job.urls.filter((url) => url.status === 'needs_review')
  const shown = [...job.urls]
    .sort(
      (a, b) =>
        (STATUS_ORDER.indexOf(a.status) + 1 || 99) -
          (STATUS_ORDER.indexOf(b.status) + 1 || 99) ||
        a.url.localeCompare(b.url),
    )
    .slice(0, URL_ROWS)
    .map((url) => ({
      status: url.status,
      url: url.url,
      why:
        url.skipReason ??
        (url.preflightWarnings?.length
          ? `${url.preflightWarnings.join(', ')}${url.mainWordCount != null ? ` (${url.mainWordCount} words)` : ''}`
          : ''),
      url_id: url.status === 'needs_review' ? url.id : '',
    }))
  const options = [
    job.options?.fast ? 'Fast' : null,
    job.options?.bing ? 'Bing' : null,
  ].filter(Boolean)
  return [
    `${created ? 'Sent to Index My Site as job' : 'Index My Site job'} ${job.id}${job.name ? ` (${job.name})` : ''}: ${plural(job.total, 'URL')}, ${job.creditsPerUrl} credit${job.creditsPerUrl === 1 ? '' : 's'} per sent URL${options.length ? ` with ${options.join(' and ')}` : ''}. ${counted(job.counts)}.`,
    job.guidance?.message ?? '',
    review.length
      ? `${plural(review.length, 'URL')} ${review.length === 1 ? 'waits' : 'wait'} for approval because little main content was found. Show the person each one and its warning; to approve, run ${call('submit', { action: 'indexmysite_approve', job_id: job.id })} with the url_ids they choose.`
      : '',
    shown.length
      ? `${job.urls.length > URL_ROWS ? `The first ${URL_ROWS} URLs, by status` : 'URLs, by status'}:\n${table(shown, ['status', 'url', 'why', 'url_id'], null)}`
      : '',
    `Check again with ${call('submit', { action: 'indexmysite_status', job_id: job.id })}.`,
  ]
    .filter(Boolean)
    .join('\n')
}

async function status(
  input: SubmitInput,
  submit: SubmitAccess,
  call: Caller,
): Promise<CommandResult> {
  const ims = await connected(submit)
  if (input.jobId) {
    const job = await ims.job(input.jobId)
    return {
      text: jobText(job, call, false),
      data: { action: 'indexmysite_status', job },
    }
  }
  const [credits, jobs] = await Promise.all([ims.credits(), ims.jobs()])
  const recent = jobs.slice(0, 10)
  return {
    text: [
      `Index My Site balance: ${plural(credits.balance, 'credit')}.`,
      recent.length
        ? `Latest ${plural(recent.length, 'job')} of ${n(jobs.length)}:\n${table(
            recent.map((job) => ({
              job_id: job.id,
              name: job.name,
              created: new Date(job.createdAt).toISOString().slice(0, 10),
              urls: job.total,
              statuses: counted(job.counts),
              checks_to_come: job.backgroundPending,
            })),
            ['job_id', 'name', 'created', 'urls', 'statuses', 'checks_to_come'],
            null,
          )}\nOne job's URLs: ${call('submit', { action: 'indexmysite_status', job_id: '<job_id>' })}.`
        : 'No jobs yet.',
    ].join('\n'),
    data: { action: 'indexmysite_status', credits, jobs: recent },
  }
}

async function approve(
  input: SubmitInput,
  submit: SubmitAccess,
  call: Caller,
): Promise<CommandResult> {
  if (!input.jobId) {
    throw new CommandError('INVALID_INPUT', 'Give the job id in job_id.')
  }
  if (!input.all && !input.urlIds?.length) {
    throw new CommandError(
      'INVALID_INPUT',
      'Give the URL ids to approve in url_ids, or all true when the person chose every waiting URL.',
    )
  }
  const ims = await connected(submit)
  const job = await ims.job(input.jobId)
  const chosen = new Set(input.urlIds ?? [])
  const waiting = job.urls.filter(
    (url) => url.status === 'needs_review' && (input.all || chosen.has(url.id)),
  )
  if (!waiting.length) {
    return {
      text: `No chosen URL in job ${job.id} is waiting for approval.`,
      data: { action: 'indexmysite_approve', approved: 0 },
    }
  }
  if (!input.confirm) {
    const credits = await ims.credits()
    return {
      text: [
        `Approval quote for job ${job.id}. Nothing is approved yet.`,
        `${plural(waiting.length, 'URL')} × ${job.creditsPerUrl} credit${job.creditsPerUrl === 1 ? '' : 's'} = up to ${plural(waiting.length * job.creditsPerUrl, 'credit')} when they are sent. Balance: ${plural(credits.balance, 'credit')}.`,
        table(
          waiting.slice(0, URL_ROWS).map((url) => ({
            url: url.url,
            warning: (url.preflightWarnings ?? []).join(', '),
            words: url.mainWordCount ?? '',
            url_id: url.id,
          })),
          ['url', 'warning', 'words', 'url_id'],
          null,
        ),
        `Show the person each warning and the cost. To approve, run ${call('submit', { action: 'indexmysite_approve', job_id: job.id, confirm: 'true' })} with the same url_ids${input.all ? ' (or all true)' : ''}.`,
      ].join('\n'),
      data: {
        action: 'indexmysite_approve',
        approved: 0,
        waiting: waiting.length,
        creditsPerUrl: job.creditsPerUrl,
      },
    }
  }
  const result = await ims.approve(
    job.id,
    input.all ? { all: true } : { urlIds: waiting.map((url) => url.id) },
  )
  return {
    text: `Approved ${plural(result.approved, 'URL')} in job ${job.id}${result.skippedDuplicates ? `; ${plural(result.skippedDuplicates, 'URL')} skipped because another job already holds them` : ''}. Each is charged when it is sent. Check with ${call('submit', { action: 'indexmysite_status', job_id: job.id })}.`,
    data: { action: 'indexmysite_approve', ...result },
  }
}

// ---- Where other commands suggest it ----

// Google's reasons for a page it has not indexed where asking for a crawl
// can help, once nothing else is wrong.
export const SUBMITTABLE_REASON =
  /^(Crawled|Discovered) - currently not indexed$|^URL is unknown to Google$/i

// One line for live, indexable pages Google has not indexed: the free and
// the paid way to ask for a crawl, never a promise of indexing.
export function submitSuggestion(count: number, call: Caller): string | null {
  if (count < 1) return null
  return `${plural(count, 'URL')} above ${count === 1 ? 'returns' : 'return'} 200 with no redirect and ${count === 1 ? 'is' : 'are'} not in Google's index (crawled or discovered but not indexed, or unknown to Google). Asking for a crawl can help a page Google has not reached; it does not make Google index a page it chose to leave out. Free: IndexNow, for Bing, Yandex and others, not Google: ${call('submit', { action: 'indexnow' })}. Paid: Index My Site (indexmysite.app) sends them to Google and gives a credit back for each page Google has not indexed by its final check: ${call('submit', { action: 'indexmysite' })}.`
}
