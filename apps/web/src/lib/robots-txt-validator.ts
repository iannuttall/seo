export const ROBOTS_TXT_LIMITS = Object.freeze({
  bytes: 500 * 1_024,
  urls: 100,
  retainedIssues: 1_000,
})

export type RobotsIssueSeverity = 'error' | 'warning' | 'note'

export type RobotsIssue = {
  severity: RobotsIssueSeverity
  code: string
  line?: number
  message: string
}

export type RobotsRule = {
  directive: 'allow' | 'disallow'
  pattern: string
  line: number
}

export type RobotsGroup = {
  userAgents: Array<{ value: string; line: number }>
  rules: RobotsRule[]
}

export type RobotsSitemap = {
  value: string
  line: number
  valid: boolean
}

export type RobotsDocument = {
  schema: 1
  bytes: number
  lines: number
  groups: RobotsGroup[]
  sitemaps: RobotsSitemap[]
  issues: RobotsIssue[]
  issueCounts: Record<RobotsIssueSeverity, number>
  rules: number
  ignoredLines: number
}

export type RobotsUrlResult = {
  input: string
  url?: string
  userAgent: string
  verdict: 'allowed' | 'blocked' | 'not-applicable' | 'invalid'
  groupUserAgents: string[]
  rule?: RobotsRule & { specificity: number }
  reason: string
}

export type RobotsAnalysis = {
  schema: 1
  origin: string
  userAgent: string
  document: RobotsDocument
  tests: RobotsUrlResult[]
}

export const ROBOTS_CRAWLER_PRESETS = Object.freeze([
  { value: 'Googlebot', label: 'Googlebot', purpose: 'Google Search' },
  { value: 'Bingbot', label: 'Bingbot', purpose: 'Bing Search' },
  {
    value: 'OAI-SearchBot',
    label: 'OAI-SearchBot',
    purpose: 'ChatGPT search',
  },
  {
    value: 'Claude-SearchBot',
    label: 'Claude-SearchBot',
    purpose: 'Claude search',
  },
  {
    value: 'PerplexityBot',
    label: 'PerplexityBot',
    purpose: 'Perplexity search',
  },
  {
    value: 'GPTBot',
    label: 'GPTBot',
    purpose: 'OpenAI model training',
  },
  {
    value: 'ClaudeBot',
    label: 'ClaudeBot',
    purpose: 'Anthropic model training',
  },
  {
    value: 'Google-Extended',
    label: 'Google-Extended',
    purpose: 'Gemini training and grounding control',
  },
  {
    value: 'ChatGPT-User',
    label: 'ChatGPT-User',
    purpose: 'ChatGPT user requests',
  },
  {
    value: 'Claude-User',
    label: 'Claude-User',
    purpose: 'Claude user requests',
  },
  {
    value: 'Googlebot-Image',
    label: 'Googlebot-Image',
    purpose: 'Google Images',
  },
  {
    value: 'Googlebot-News',
    label: 'Googlebot-News',
    purpose: 'Google News',
  },
  {
    value: 'Googlebot-Video',
    label: 'Googlebot-Video',
    purpose: 'Google Video',
  },
  {
    value: 'Google-InspectionTool',
    label: 'Google-InspectionTool',
    purpose: 'Google inspection tools',
  },
  { value: 'Applebot', label: 'Applebot', purpose: 'Apple search' },
  {
    value: 'Applebot-Extended',
    label: 'Applebot-Extended',
    purpose: 'Apple model control',
  },
  { value: 'CCBot', label: 'CCBot', purpose: 'Common Crawl' },
  { value: 'Bytespider', label: 'Bytespider', purpose: 'ByteDance crawler' },
  { value: 'custom', label: 'Custom user agent', purpose: 'Custom' },
])

export class RobotsTxtInputError extends Error {}
export class RobotsTxtLimitError extends Error {}

const USER_AGENT_TOKEN = /^(?:\*|[A-Za-z_-]+)$/u
const FIELD_LINE = /^[\t ]*([^\s:]+)[\t ]*:[\t ]*(.*?)[\t ]*$/u
const HEX_PAIR = /^[\da-f]{2}$/iu
const UNRESERVED_ASCII = /^[A-Za-z0-9._~-]$/u

function countUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function issue(target: RobotsDocument, value: RobotsIssue): void {
  target.issueCounts[value.severity] += 1
  if (target.issues.length < ROBOTS_TXT_LIMITS.retainedIssues) {
    target.issues.push(value)
  }
}

function stripComment(value: string): string {
  const index = value.indexOf('#')
  return (index === -1 ? value : value.slice(0, index)).replace(/[\t ]+$/u, '')
}

function validAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

export function parseRobotsTxt(content: string): RobotsDocument {
  const bytes = countUtf8Bytes(content)
  if (bytes > ROBOTS_TXT_LIMITS.bytes) {
    throw new RobotsTxtLimitError(
      `The robots.txt content exceeds the ${ROBOTS_TXT_LIMITS.bytes.toLocaleString()} byte limit.`,
    )
  }

  const rawLines = content.split(/\r\n|\n|\r/u)
  const document: RobotsDocument = {
    schema: 1,
    bytes,
    lines: rawLines.length,
    groups: [],
    sitemaps: [],
    issues: [],
    issueCounts: { error: 0, warning: 0, note: 0 },
    rules: 0,
    ignoredLines: 0,
  }

  let currentGroup: RobotsGroup | undefined
  let groupHasRules = false

  if (content.startsWith('\uFEFF')) {
    issue(document, {
      severity: 'note',
      code: 'byte-order-mark',
      line: 1,
      message: 'The leading byte order mark is ignored by Google.',
    })
  }

  for (let index = 0; index < rawLines.length; index += 1) {
    const lineNumber = index + 1
    const raw =
      index === 0 ? rawLines[index].replace(/^\uFEFF/u, '') : rawLines[index]
    const withoutComment = stripComment(raw)
    if (!withoutComment.trim()) continue

    const match = withoutComment.match(FIELD_LINE)
    if (!match) {
      document.ignoredLines += 1
      issue(document, {
        severity: 'error',
        code: 'missing-colon',
        line: lineNumber,
        message:
          'This line is ignored because it is not a field followed by a colon.',
      })
      continue
    }

    const field = match[1].toLowerCase()
    const value = match[2]
    if (field === 'user-agent') {
      if (!USER_AGENT_TOKEN.test(value)) {
        document.ignoredLines += 1
        issue(document, {
          severity: 'error',
          code: 'invalid-user-agent',
          line: lineNumber,
          message:
            'This user-agent token is empty or contains unsupported characters.',
        })
        continue
      }
      if (!currentGroup || groupHasRules) {
        currentGroup = { userAgents: [], rules: [] }
        document.groups.push(currentGroup)
        groupHasRules = false
      }
      currentGroup.userAgents.push({ value, line: lineNumber })
      continue
    }

    if (field === 'allow' || field === 'disallow') {
      groupHasRules = true
      if (!currentGroup) {
        document.ignoredLines += 1
        issue(document, {
          severity: 'error',
          code: 'rule-before-user-agent',
          line: lineNumber,
          message:
            'This rule is ignored because it appears before a user-agent group.',
        })
        continue
      }
      if (!value) {
        document.ignoredLines += 1
        issue(document, {
          severity: 'note',
          code: 'empty-rule',
          line: lineNumber,
          message: `This empty ${field} rule is ignored.`,
        })
        continue
      }
      if (!value.startsWith('/')) {
        document.ignoredLines += 1
        issue(document, {
          severity: 'error',
          code: 'invalid-rule-path',
          line: lineNumber,
          message:
            'This rule is ignored because its path does not start with a forward slash.',
        })
        continue
      }
      currentGroup.rules.push({
        directive: field,
        pattern: value,
        line: lineNumber,
      })
      document.rules += 1
      continue
    }

    if (field === 'sitemap') {
      const valid = validAbsoluteHttpUrl(value)
      document.sitemaps.push({ value, line: lineNumber, valid })
      if (!valid) {
        issue(document, {
          severity: 'warning',
          code: 'invalid-sitemap-url',
          line: lineNumber,
          message: 'The sitemap value should be a complete HTTP or HTTPS URL.',
        })
      }
      continue
    }

    document.ignoredLines += 1
    issue(document, {
      severity: field === 'crawl-delay' ? 'note' : 'warning',
      code:
        field === 'crawl-delay'
          ? 'google-ignores-crawl-delay'
          : 'unknown-field',
      line: lineNumber,
      message:
        field === 'crawl-delay'
          ? 'Google ignores crawl-delay, although some other crawlers support it.'
          : `The ${field} field is not part of RFC 9309 and may be ignored by crawlers.`,
    })
  }

  if (document.groups.length === 0) {
    issue(document, {
      severity: content.trim() ? 'warning' : 'note',
      code: 'no-user-agent-groups',
      message: content.trim()
        ? 'No parseable user-agent groups were found.'
        : 'An empty robots.txt file sets no crawl restrictions.',
    })
  }

  const seenSitemaps = new Set<string>()
  for (const sitemap of document.sitemaps) {
    if (seenSitemaps.has(sitemap.value)) {
      issue(document, {
        severity: 'note',
        code: 'duplicate-sitemap',
        line: sitemap.line,
        message: 'This sitemap URL is declared more than once.',
      })
    }
    seenSitemaps.add(sitemap.value)
  }

  return document
}

function normalizeForMatching(value: string): string {
  let normalized = ''
  for (let index = 0; index < value.length; ) {
    const character = value[index]
    if (character === '%' && HEX_PAIR.test(value.slice(index + 1, index + 3))) {
      const hexadecimal = value.slice(index + 1, index + 3).toUpperCase()
      const decoded = String.fromCharCode(Number.parseInt(hexadecimal, 16))
      normalized += UNRESERVED_ASCII.test(decoded) ? decoded : `%${hexadecimal}`
      index += 3
      continue
    }
    const codePoint = value.codePointAt(index)
    if (codePoint === undefined) break
    const text = String.fromCodePoint(codePoint)
    normalized +=
      codePoint > 0x7f ? encodeURIComponent(text).toUpperCase() : text
    index += text.length
  }
  return normalized
}

function globMatches(pattern: string, target: string): boolean {
  const endAnchored = pattern.endsWith('$')
  const source = endAnchored ? pattern.slice(0, -1) : `${pattern}*`
  let sourceIndex = 0
  let targetIndex = 0
  let starIndex = -1
  let starTargetIndex = -1

  while (targetIndex < target.length) {
    if (source[sourceIndex] === target[targetIndex]) {
      sourceIndex += 1
      targetIndex += 1
      continue
    }
    if (source[sourceIndex] === '*') {
      starIndex = sourceIndex
      starTargetIndex = targetIndex
      sourceIndex += 1
      continue
    }
    if (starIndex !== -1) {
      sourceIndex = starIndex + 1
      starTargetIndex += 1
      targetIndex = starTargetIndex
      continue
    }
    return false
  }
  while (source[sourceIndex] === '*') sourceIndex += 1
  return sourceIndex === source.length
}

function specificity(pattern: string): number {
  const normalized = normalizeForMatching(pattern.replace(/\$$/u, ''))
  let bytes = 0
  for (let index = 0; index < normalized.length; ) {
    if (normalized[index] === '*') {
      index += 1
    } else if (
      normalized[index] === '%' &&
      HEX_PAIR.test(normalized.slice(index + 1, index + 3))
    ) {
      bytes += 1
      index += 3
    } else {
      bytes += 1
      index += 1
    }
  }
  return bytes
}

function applicableGroups(
  document: RobotsDocument,
  userAgent: string,
): { groups: RobotsGroup[]; userAgents: string[] } {
  const identification = userAgent.toLowerCase()
  let bestLength = 0
  const matchedTokens = new Set<string>()

  for (const group of document.groups) {
    for (const entry of group.userAgents) {
      const token = entry.value.toLowerCase()
      if (token === '*' || !identification.includes(token)) continue
      if (token.length > bestLength) {
        bestLength = token.length
        matchedTokens.clear()
      }
      if (token.length === bestLength) matchedTokens.add(token)
    }
  }

  if (matchedTokens.size > 0) {
    return {
      groups: document.groups.filter((group) =>
        group.userAgents.some((entry) =>
          matchedTokens.has(entry.value.toLowerCase()),
        ),
      ),
      userAgents: [...matchedTokens],
    }
  }

  return {
    groups: document.groups.filter((group) =>
      group.userAgents.some((entry) => entry.value === '*'),
    ),
    userAgents: document.groups.some((group) =>
      group.userAgents.some((entry) => entry.value === '*'),
    )
      ? ['*']
      : [],
  }
}

function parseOrigin(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new RobotsTxtInputError('Enter a complete HTTP or HTTPS site origin.')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new RobotsTxtInputError('Enter a complete HTTP or HTTPS site origin.')
  }
  return new URL(url.origin)
}

export function testRobotsUrl(
  document: RobotsDocument,
  input: string,
  userAgent: string,
  originValue: string,
): RobotsUrlResult {
  const base = parseOrigin(originValue)
  let url: URL
  try {
    url = input.trim().startsWith('/')
      ? new URL(input.trim(), base)
      : new URL(input.trim())
  } catch {
    return {
      input,
      userAgent,
      verdict: 'invalid',
      groupUserAgents: [],
      reason:
        'Enter a complete URL or a path that starts with a forward slash.',
    }
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return {
      input,
      userAgent,
      verdict: 'invalid',
      groupUserAgents: [],
      reason: 'Only HTTP and HTTPS URLs can be tested.',
    }
  }
  if (url.origin !== base.origin) {
    return {
      input,
      url: url.toString(),
      userAgent,
      verdict: 'not-applicable',
      groupUserAgents: [],
      reason: `These rules apply only to ${base.origin}.`,
    }
  }
  if (url.pathname === '/robots.txt') {
    return {
      input,
      url: url.toString(),
      userAgent,
      verdict: 'allowed',
      groupUserAgents: [],
      reason: 'RFC 9309 implicitly allows the robots.txt file itself.',
    }
  }

  const selected = applicableGroups(document, userAgent)
  const target = normalizeForMatching(`${url.pathname}${url.search}`)
  let winner: (RobotsRule & { specificity: number }) | undefined
  for (const group of selected.groups) {
    for (const rule of group.rules) {
      const normalizedPattern = normalizeForMatching(rule.pattern)
      if (!globMatches(normalizedPattern, target)) continue
      const ruleSpecificity = specificity(rule.pattern)
      if (
        !winner ||
        ruleSpecificity > winner.specificity ||
        (ruleSpecificity === winner.specificity &&
          rule.directive === 'allow' &&
          winner.directive === 'disallow')
      ) {
        winner = { ...rule, specificity: ruleSpecificity }
      }
    }
  }

  if (!winner) {
    return {
      input,
      url: url.toString(),
      userAgent,
      verdict: 'allowed',
      groupUserAgents: selected.userAgents,
      reason: selected.groups.length
        ? 'No rule in the selected group matches this URL.'
        : 'No user-agent group applies, so the URL is allowed by default.',
    }
  }

  const allowed = winner.directive === 'allow'
  return {
    input,
    url: url.toString(),
    userAgent,
    verdict: allowed ? 'allowed' : 'blocked',
    groupUserAgents: selected.userAgents,
    rule: winner,
    reason: `${allowed ? 'Allowed' : 'Blocked'} by line ${winner.line}: ${winner.directive}: ${winner.pattern}`,
  }
}

export function analyseRobotsTxt(input: {
  content: string
  origin: string
  urls: string[]
  userAgent: string
}): RobotsAnalysis {
  const userAgent = input.userAgent.trim()
  if (!userAgent || userAgent.length > 256) {
    throw new RobotsTxtInputError('Enter a user agent up to 256 characters.')
  }
  if (input.urls.length > ROBOTS_TXT_LIMITS.urls) {
    throw new RobotsTxtLimitError(
      `Test no more than ${ROBOTS_TXT_LIMITS.urls.toLocaleString()} URLs at once.`,
    )
  }
  const origin = parseOrigin(input.origin).origin
  const document = parseRobotsTxt(input.content)
  return {
    schema: 1,
    origin,
    userAgent,
    document,
    tests: input.urls.map((url) =>
      testRobotsUrl(document, url, userAgent, origin),
    ),
  }
}
