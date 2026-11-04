import { SEO_CRAWLER_USER_AGENT } from '../fetch/crawler-identity.js'
import { readJson } from '../http/read-json.js'
import { CommandError, type CommandResult } from './types.js'

// seo social-posts: one person's X posts with their public numbers, read
// through FxTwitter (api.fxtwitter.com, no key). The timeline gives only the
// most recent posts, so older posts come in as URLs or IDs and are looked up
// one by one. At most 3 + 3 + 50 x 2 requests, each bounded in time and
// size, a few at a time, nothing stored. Pure JavaScript, so the CLI and the
// hosted MCP read posts the same way.

const API = 'https://api.fxtwitter.com/2'
const TIMEOUT_MS = 10_000
const PAGE_BYTES = 2_000_000
const STATUS_BYTES = 500_000
const PROFILE_BYTES = 200_000
const PAGE_SIZE = 100
const TIMELINE_PAGES = 3
// FxTwitter often answers a timeline request with a 404 or an error and the
// next identical request with the page, so a few retries share this budget.
const TIMELINE_REQUESTS = 6
const PROFILE_REQUESTS = 3
const LOOKUP_ATTEMPTS = 2
const CONCURRENCY = 4
const TEXT_CHARS = 200
const LINKS_PER_POST = 5
export const SOCIAL_POSTS_MAX_LOOKUPS = 50

export const SOCIAL_POSTS_NOTE =
  "Numbers are FxTwitter's public counts at the time of this request, not X analytics, and views are missing when X shows none. The timeline covers only the most recent posts (about two weeks); pass older post URLs or IDs to get their numbers."

export type SocialPost = {
  id: string
  url: string
  // ISO time the post went up. null when FxTwitter gave no usable date.
  date: string | null
  // The first 200 characters, whitespace collapsed.
  text: string
  views: number | null
  likes: number
  reposts: number
  quotes: number
  replies: number
  bookmarks: number
  // Links to other sites in the post, not X or t.co links. Five at most.
  links: string[]
  linksOut: boolean
  reply: boolean
  quote: boolean
  source: 'timeline' | 'lookup'
}

// found: FxTwitter returned the account or posts by it. suspended: FxTwitter
// said so. not_found: every profile request said "User not found" (FxTwitter
// sometimes says this for real accounts too). unavailable: no answer.
export type SocialAccountState =
  | 'found'
  | 'suspended'
  | 'not_found'
  | 'unavailable'

export type SocialLookupFailure = {
  id: string
  // not_found: no such post. private, deleted, suspended: FxTwitter's reason.
  // unavailable: a rate limit, server error, timeout or unreadable reply.
  reason: 'not_found' | 'private' | 'deleted' | 'suspended' | 'unavailable'
  status: number | null
  error?: string
}

export type SocialPostsData = {
  handle: string
  account: {
    state: SocialAccountState
    name: string | null
    followers: number | null
    error?: string
  }
  timeline: {
    // read: at least one page came back. empty: a page came back with no
    // posts. unavailable: no page came back, so nothing is known.
    state: 'read' | 'empty' | 'unavailable'
    pages: number
    requests: number
    // Posts by the handle kept from the timeline.
    posts: number
    skippedReposts: number
    skippedReplies: number
    oldest: string | null
    newest: string | null
    error?: string
  }
  lookups: {
    requested: number
    found: number
    // Posts that exist but belong to another account, so they are left out.
    otherAuthor: Array<{ id: string; author: string }>
    failed: SocialLookupFailure[]
  }
  includeReplies: boolean
  posts: SocialPost[]
  note: string
}

type Fetch = typeof fetch

type RawStatus = {
  type?: unknown
  id?: unknown
  url?: unknown
  text?: unknown
  created_at?: unknown
  created_timestamp?: unknown
  views?: unknown
  likes?: unknown
  reposts?: unknown
  quotes?: unknown
  replies?: unknown
  bookmarks?: unknown
  author?: { screen_name?: unknown; name?: unknown; followers?: unknown }
  reposted_by?: unknown
  replying_to?: unknown
  quote?: unknown
  reason?: unknown
  raw_text?: { facets?: Array<{ type?: unknown; replacement?: unknown }> }
}

type Reply = {
  status: number | null
  json?: Record<string, unknown>
  error?: string
}

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'fetch failed'

const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const sameHandle = (a: unknown, b: string) =>
  typeof a === 'string' && a.toLowerCase() === b.toLowerCase()

async function getJson(
  fetchImpl: Fetch,
  url: string,
  maxBytes: number,
): Promise<Reply> {
  try {
    const response = await fetchImpl(url, {
      headers: {
        // FxTwitter answers 401 to a request with no user agent.
        'user-agent': SEO_CRAWLER_USER_AGENT,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const isJson = /\bjson\b/i.test(response.headers.get('content-type') ?? '')
    if (!isJson) {
      await response.body?.cancel()
      return { status: response.status }
    }
    const json = await readJson<Record<string, unknown>>(
      response,
      'FxTwitter',
      {
        maxBytes,
      },
    )
    return { status: response.status, json }
  } catch (error) {
    return { status: null, error: errorText(error) }
  }
}

// "@name", "name" or "https://x.com/name" becomes "name".
export function socialHandle(input: string): string {
  let value = input.trim()
  try {
    const url = new URL(value)
    if (/^(?:www\.|mobile\.)?(?:x|twitter)\.com$/i.test(url.hostname)) {
      value = url.pathname.split('/').filter(Boolean)[0] ?? ''
    }
  } catch {
    // Not a URL.
  }
  value = value.replace(/^@/, '')
  if (!/^[A-Za-z0-9_]{1,15}$/.test(value)) {
    throw new CommandError(
      'INVALID_INPUT',
      `${input} is not an X handle. Use the name after x.com/, such as example.`,
    )
  }
  return value
}

// A post ID, or an X, Twitter or FxTwitter post URL, becomes the post ID.
export function socialPostId(input: string): string | null {
  const value = input.trim()
  if (/^\d{2,20}$/.test(value)) return value
  try {
    const url = new URL(value)
    if (
      !/(?:^|\.)(?:x|twitter|fxtwitter|fixupx|vxtwitter|fixvx)\.com$/i.test(
        url.hostname,
      )
    ) {
      return null
    }
    return /\/status(?:es)?\/(\d{2,20})(?:\/|$)/.exec(url.pathname)?.[1] ?? null
  } catch {
    return null
  }
}

function postDate(status: RawStatus): string | null {
  const seconds = status.created_timestamp
  const time =
    typeof seconds === 'number' && Number.isFinite(seconds)
      ? seconds * 1000
      : typeof status.created_at === 'string'
        ? Date.parse(status.created_at)
        : Number.NaN
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

function outLinks(status: RawStatus): string[] {
  const links: string[] = []
  for (const facet of status.raw_text?.facets ?? []) {
    if (facet.type !== 'url' || typeof facet.replacement !== 'string') continue
    let host: string
    try {
      host = new URL(facet.replacement).hostname
    } catch {
      continue
    }
    if (/(?:^|\.)(?:x\.com|twitter\.com|t\.co)$/i.test(host)) continue
    if (!links.includes(facet.replacement)) links.push(facet.replacement)
  }
  return links
}

function toPost(
  status: RawStatus,
  handle: string,
  source: SocialPost['source'],
): SocialPost {
  const id = String(status.id)
  const text = typeof status.text === 'string' ? status.text : ''
  const chars = [...text.replace(/\s+/g, ' ').trim()]
  const links = outLinks(status)
  return {
    id,
    url:
      typeof status.url === 'string'
        ? status.url
        : `https://x.com/${handle}/status/${id}`,
    date: postDate(status),
    text:
      chars.length > TEXT_CHARS
        ? `${chars.slice(0, TEXT_CHARS).join('')}…`
        : chars.join(''),
    views:
      typeof status.views === 'number' && Number.isFinite(status.views)
        ? status.views
        : null,
    likes: count(status.likes),
    reposts: count(status.reposts),
    quotes: count(status.quotes),
    replies: count(status.replies),
    bookmarks: count(status.bookmarks),
    links: links.slice(0, LINKS_PER_POST),
    linksOut: links.length > 0,
    reply: Boolean(status.replying_to),
    quote: Boolean(status.quote),
    source,
  }
}

const isPostId = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{1,20}$/.test(value)

async function readTimeline(
  fetchImpl: Fetch,
  handle: string,
  includeReplies: boolean,
  posts: Map<string, SocialPost>,
  account: { name: string | null; followers: number | null },
): Promise<SocialPostsData['timeline']> {
  const timeline: SocialPostsData['timeline'] = {
    state: 'unavailable',
    pages: 0,
    requests: 0,
    posts: 0,
    skippedReposts: 0,
    skippedReplies: 0,
    oldest: null,
    newest: null,
  }
  const seen = new Set<string>()
  let cursor: string | null = null
  let lastError: string | undefined
  while (
    timeline.pages < TIMELINE_PAGES &&
    timeline.requests < TIMELINE_REQUESTS
  ) {
    const query = new URLSearchParams({ count: String(PAGE_SIZE) })
    if (cursor) query.set('cursor', cursor)
    if (includeReplies) query.set('with_replies', '1')
    timeline.requests += 1
    const reply = await getJson(
      fetchImpl,
      `${API}/profile/${encodeURIComponent(handle)}/statuses?${query}`,
      PAGE_BYTES,
    )
    const results = reply.json?.results
    if (reply.status !== 200 || !Array.isArray(results)) {
      lastError = reply.error ?? `HTTP ${reply.status ?? 'no response'}`
      continue
    }
    timeline.pages += 1
    let added = 0
    for (const item of results as RawStatus[]) {
      if (!isPostId(item?.id) || seen.has(item.id)) continue
      seen.add(item.id)
      added += 1
      if (item.reposted_by || !sameHandle(item.author?.screen_name, handle)) {
        timeline.skippedReposts += 1
        continue
      }
      if (item.replying_to && !includeReplies) {
        timeline.skippedReplies += 1
        continue
      }
      if (account.name === null && typeof item.author?.name === 'string') {
        account.name = item.author.name
      }
      if (
        account.followers === null &&
        typeof item.author?.followers === 'number'
      ) {
        account.followers = item.author.followers
      }
      posts.set(item.id, toPost(item, handle, 'timeline'))
      timeline.posts += 1
    }
    const bottom = (reply.json?.cursor as { bottom?: unknown } | undefined)
      ?.bottom
    // The last page repeats itself, so a page with no new posts ends it.
    if (!added || typeof bottom !== 'string' || bottom === cursor) break
    cursor = bottom
  }
  if (timeline.pages) {
    timeline.state = seen.size ? 'read' : 'empty'
  } else if (lastError) {
    timeline.error = `FxTwitter did not return the timeline in ${timeline.requests} requests (last: ${lastError}).`
  }
  const dates = [...posts.values()]
    .map((post) => post.date)
    .filter((date): date is string => date !== null)
    .sort()
  timeline.oldest = dates[0] ?? null
  timeline.newest = dates.at(-1) ?? null
  return timeline
}

async function readProfile(
  fetchImpl: Fetch,
  handle: string,
): Promise<SocialPostsData['account']> {
  let notFound = 0
  let lastError = ''
  for (let attempt = 0; attempt < PROFILE_REQUESTS; attempt += 1) {
    const reply = await getJson(
      fetchImpl,
      `${API}/profile/${encodeURIComponent(handle)}`,
      PROFILE_BYTES,
    )
    const user = reply.json?.user as
      | { name?: unknown; followers?: unknown }
      | undefined
    if (reply.status === 200 && user) {
      return {
        state: 'found',
        name: typeof user.name === 'string' ? user.name : null,
        followers: typeof user.followers === 'number' ? user.followers : null,
      }
    }
    const said = `${reply.json?.reason ?? ''} ${reply.json?.message ?? ''}`
    if (/suspended/i.test(said)) {
      return { state: 'suspended', name: null, followers: null }
    }
    if (reply.status === 404) notFound += 1
    lastError = reply.error ?? `HTTP ${reply.status ?? 'no response'}`
  }
  return notFound === PROFILE_REQUESTS
    ? {
        state: 'not_found',
        name: null,
        followers: null,
        error: `FxTwitter said "User not found" ${PROFILE_REQUESTS} times. It sometimes says this for real accounts, so check the handle and try again later before you treat the account as gone.`,
      }
    : { state: 'unavailable', name: null, followers: null, error: lastError }
}

type Lookup =
  | { kind: 'post'; status: RawStatus }
  | { kind: 'other'; id: string; author: string }
  | { kind: 'failed'; failure: SocialLookupFailure }

async function lookUp(
  fetchImpl: Fetch,
  id: string,
  handle: string,
): Promise<Lookup> {
  let failure: SocialLookupFailure = {
    id,
    reason: 'unavailable',
    status: null,
  }
  for (let attempt = 0; attempt < LOOKUP_ATTEMPTS; attempt += 1) {
    const reply = await getJson(fetchImpl, `${API}/status/${id}`, STATUS_BYTES)
    const status = reply.json?.status as RawStatus | null | undefined
    if (status && status.type !== 'tombstone' && isPostId(status.id)) {
      if (!sameHandle(status.author?.screen_name, handle)) {
        return {
          kind: 'other',
          id,
          author: String(status.author?.screen_name ?? 'unknown'),
        }
      }
      return { kind: 'post', status }
    }
    const reason = status?.reason
    if (
      reason === 'private' ||
      reason === 'deleted' ||
      reason === 'suspended'
    ) {
      return { kind: 'failed', failure: { id, reason, status: reply.status } }
    }
    if (reply.status === 401) {
      return {
        kind: 'failed',
        failure: { id, reason: 'private', status: 401 },
      }
    }
    failure =
      reply.status === 404 || reply.status === 400
        ? { id, reason: 'not_found', status: reply.status }
        : {
            id,
            reason: 'unavailable',
            status: reply.status,
            error: reply.error ?? `HTTP ${reply.status ?? 'no response'}`,
          }
    if (reply.status === 400) break
  }
  return { kind: 'failed', failure }
}

// Most views first; posts with no view count last. Then bookmarks, then
// the newer post.
function byViews(a: SocialPost, b: SocialPost): number {
  const views = (b.views ?? -1) - (a.views ?? -1)
  if (views) return views
  if (b.bookmarks !== a.bookmarks) return b.bookmarks - a.bookmarks
  return b.id.length - a.id.length || (b.id > a.id ? 1 : b.id < a.id ? -1 : 0)
}

export async function runSocialPosts(
  input: { handle: string; posts?: string[]; replies?: boolean },
  fetchImpl: Fetch = fetch,
): Promise<CommandResult> {
  const handle = socialHandle(input.handle)
  const ids: string[] = []
  for (const entry of input.posts ?? []) {
    const id = socialPostId(entry)
    if (!id) {
      throw new CommandError(
        'INVALID_INPUT',
        `${entry} is not an X post URL or ID. Use a URL such as https://x.com/example/status/1234567890 or the number at its end.`,
      )
    }
    if (!ids.includes(id)) ids.push(id)
  }
  if (ids.length > SOCIAL_POSTS_MAX_LOOKUPS) {
    throw new CommandError(
      'INVALID_INPUT',
      `At most ${SOCIAL_POSTS_MAX_LOOKUPS} posts can be looked up in one run; ${ids.length} were given.`,
    )
  }
  const includeReplies = input.replies ?? false

  const posts = new Map<string, SocialPost>()
  const seenAccount = {
    name: null as string | null,
    followers: null as number | null,
  }
  const timeline = await readTimeline(
    fetchImpl,
    handle,
    includeReplies,
    posts,
    seenAccount,
  )

  // Posts already on the timeline are not requested again.
  const queue = ids.filter((id) => !posts.has(id))
  const results: Lookup[] = new Array(queue.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (next < queue.length) {
        const at = next++
        results[at] = await lookUp(fetchImpl, queue[at] as string, handle)
      }
    }),
  )
  const lookups: SocialPostsData['lookups'] = {
    requested: ids.length,
    found: ids.length - queue.length,
    otherAuthor: [],
    failed: [],
  }
  for (const result of results) {
    if (result.kind === 'post') {
      const post = toPost(result.status, handle, 'lookup')
      if (!posts.has(post.id)) posts.set(post.id, post)
      lookups.found += 1
      if (
        seenAccount.name === null &&
        typeof result.status.author?.name === 'string'
      ) {
        seenAccount.name = result.status.author.name
      }
    } else if (result.kind === 'other') {
      lookups.otherAuthor.push({ id: result.id, author: result.author })
    } else {
      lookups.failed.push(result.failure)
    }
  }

  // The profile is read only when no post shows the account exists.
  const account: SocialPostsData['account'] =
    timeline.pages > 0 || posts.size > 0
      ? { state: 'found', ...seenAccount }
      : await readProfile(fetchImpl, handle)

  const data: SocialPostsData = {
    handle,
    account,
    timeline,
    lookups,
    includeReplies,
    posts: [...posts.values()].sort(byViews),
    note: SOCIAL_POSTS_NOTE,
  }
  return { text: socialPostsText(data), data }
}

const number = (value: number) => value.toLocaleString('en-US')

const plural = (value: number, one: string, many = `${one}s`) =>
  `${number(value)} ${value === 1 ? one : many}`

export function socialPostsText(data: SocialPostsData): string {
  const { account, timeline, lookups } = data
  const who = [
    account.name,
    account.followers === null
      ? null
      : `${number(account.followers)} followers`,
  ]
    .filter(Boolean)
    .join(', ')
  const lines = [`X posts by @${data.handle}${who ? ` (${who})` : ''}`, '']
  if (account.state === 'suspended') {
    lines.push('FxTwitter says this account is suspended.')
  } else if (account.state === 'not_found') {
    lines.push(account.error ?? 'FxTwitter did not find this account.')
  } else if (account.state === 'unavailable') {
    lines.push(
      `Whether this account exists is not known: FxTwitter did not answer (${account.error}).`,
    )
  }
  const range =
    timeline.oldest && timeline.newest
      ? `, ${timeline.oldest.slice(0, 10)} to ${timeline.newest.slice(0, 10)}`
      : ''
  const skipped = [
    timeline.skippedReposts ? plural(timeline.skippedReposts, 'repost') : '',
    timeline.skippedReplies
      ? plural(timeline.skippedReplies, 'reply', 'replies')
      : '',
  ]
    .filter(Boolean)
    .join(' and ')
  lines.push(
    timeline.state === 'unavailable'
      ? `Timeline: not read. ${timeline.error ?? ''}`.trim()
      : timeline.state === 'empty'
        ? 'Timeline: FxTwitter returned no posts.'
        : `Timeline: ${plural(timeline.posts, 'post')} from ${plural(timeline.pages, 'page')}${range}${skipped ? `; left out ${skipped}` : ''}.`,
  )
  if (lookups.requested) {
    lines.push(
      `Looked up: ${number(lookups.found)} of ${number(lookups.requested)} posts found.`,
    )
  }
  lines.push('')
  if (!data.posts.length) lines.push('No posts by this account to show.')
  data.posts.forEach((post, index) => {
    const views =
      post.views === null ? 'views not shown' : plural(post.views, 'view')
    const flags = [post.reply ? 'reply' : '', post.quote ? 'quotes a post' : '']
      .filter(Boolean)
      .join(', ')
    lines.push(
      `${index + 1}. ${post.date?.slice(0, 10) ?? 'no date'}${flags ? ` (${flags})` : ''}: ${views}, ${plural(post.likes, 'like')}, ${plural(post.reposts, 'repost')}, ${plural(post.quotes, 'quote')}, ${plural(post.replies, 'reply', 'replies')}, ${plural(post.bookmarks, 'bookmark')}`,
      `   ${post.url}`,
      `   ${post.text || '(no text)'}`,
    )
    if (post.linksOut) lines.push(`   Links: ${post.links.join(' ')}`)
  })
  if (lookups.otherAuthor.length) {
    lines.push(
      '',
      `Left out, posted by another account: ${lookups.otherAuthor.map((item) => `${item.id} (@${item.author})`).join(', ')}.`,
    )
  }
  if (lookups.failed.length) {
    lines.push(
      '',
      `Lookups that failed: ${lookups.failed
        .map(
          (item) =>
            `${item.id} (${item.reason === 'not_found' ? 'not found' : item.reason}${item.error ? `: ${item.error}` : ''})`,
        )
        .join(', ')}.`,
    )
  }
  lines.push('', data.note)
  return lines.join('\n')
}
