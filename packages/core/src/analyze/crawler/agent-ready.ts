import { explainRule, type RuleId } from '../../rules.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import type { CrawlAiSignals, CrawlIssue } from './report.js'

// A public page: indexable HTML that anyone can load. Only public pages
// should have a Markdown copy.
export function isPublicPage(page: CrawlPageSnapshot): boolean {
  return (
    page.status >= 200 &&
    page.status < 300 &&
    page.indexable &&
    !page.softAuthenticationGate &&
    /\btext\/html\b/i.test(page.contentType ?? '')
  )
}

function needsSignIn(page: CrawlPageSnapshot): boolean {
  return (
    page.status === 401 ||
    page.status === 403 ||
    Boolean(page.softAuthenticationGate)
  )
}

function issue(
  ruleId: RuleId,
  url: string,
  detail: string,
  evidence?: Record<string, unknown>,
): CrawlIssue {
  const rule = explainRule(ruleId)
  if (!rule) throw new Error(`Missing rule guidance for ${ruleId}`)
  return {
    ruleId,
    title: rule.title,
    category: rule.category,
    severity: rule.defaultSeverity,
    url,
    detail,
    ...(evidence ? { evidence } : {}),
  }
}

// Findings from the agent checks. Each one needs a conclusive answer: a file
// or response that could not be fetched is never reported as missing.
export function agentReadyIssues(input: {
  startUrl: string
  ai: CrawlAiSignals
  pages: CrawlPageSnapshot[]
}): CrawlIssue[] {
  const { ai, startUrl } = input
  const issues: CrawlIssue[] = []

  const blocked = (ai.robotsTxt?.botAccess ?? []).filter(
    (bot) => bot.purpose === 'search' && bot.allowed === false,
  )
  if (blocked.length && ai.robotsTxt) {
    issues.push(
      issue(
        'ai_search_bot_blocked',
        ai.robotsTxt.url,
        `robots.txt blocks ${blocked.map((bot) => bot.userAgent).join(', ')} from the start URL.`,
        { blocked: blocked.map((bot) => bot.userAgent) },
      ),
    )
  }

  if (ai.llmsTxt?.availability === 'absent') {
    issues.push(
      issue(
        'llms_txt_missing',
        ai.llmsTxt.url,
        `/llms.txt returned ${ai.llmsTxt.status === undefined ? 'no file' : `HTTP ${ai.llmsTxt.status}`}.`,
      ),
    )
  }
  for (const link of ai.llmsTxt?.links?.broken ?? []) {
    issues.push(
      issue(
        'llms_txt_broken_link',
        link.url,
        link.status === undefined
          ? `The link in llms.txt could not be fetched: ${link.error ?? 'no response'}.`
          : `The link in llms.txt returned HTTP ${link.status}.`,
        { llmsTxt: ai.llmsTxt?.url, ...link },
      ),
    )
  }

  const publicPages = input.pages.filter(isPublicPage)
  const linked = publicPages.filter((page) => page.markdownAlternates?.length)
  const negotiation = ai.markdownNegotiation
  if (
    publicPages.length &&
    !linked.length &&
    negotiation?.availability === 'available' &&
    !negotiation.markdown
  ) {
    issues.push(
      issue(
        'markdown_missing',
        startUrl,
        `Accept: text/markdown returned ${negotiation.contentType || 'no content type'}, and none of ${publicPages.length} public pages links to a Markdown copy.`,
        { negotiation },
      ),
    )
  }
  if (linked.length) {
    for (const page of publicPages) {
      if (page.markdownAlternates?.length) continue
      issues.push(
        issue(
          'markdown_alternate_missing',
          page.url,
          `${linked.length} of ${publicPages.length} public pages link to a Markdown copy; this one does not.`,
        ),
      )
    }
  }

  const brokenPrivate = new Map(
    (ai.markdownCopies?.broken ?? [])
      .filter((copy) => !copy.public)
      .map((copy) => [copy.page, copy]),
  )
  for (const page of input.pages) {
    if (isPublicPage(page) || !page.markdownAlternates?.length) continue
    const copy = brokenPrivate.get(page.url)
    if (!copy && !needsSignIn(page)) continue
    const reason = needsSignIn(page)
      ? 'needs a sign-in'
      : page.indexable
        ? 'is not public'
        : 'is not indexable'
    issues.push(
      issue(
        'markdown_alternate_on_private_page',
        page.url,
        `The page ${reason} but links to a Markdown copy at ${page.markdownAlternates[0]}${copy ? `, which returned ${copy.status === undefined ? 'no response' : `HTTP ${copy.status}`}` : ''}.`,
        {
          markdownAlternates: page.markdownAlternates,
          ...(copy ? { copy } : {}),
        },
      ),
    )
  }
  for (const copy of ai.markdownCopies?.broken ?? []) {
    if (!copy.public) continue
    issues.push(
      issue(
        'markdown_copy_broken',
        copy.page,
        copy.status === undefined
          ? `The Markdown copy at ${copy.url} could not be fetched: ${copy.error ?? 'no response'}.`
          : `The Markdown copy at ${copy.url} returned HTTP ${copy.status}${copy.contentType ? ` as ${copy.contentType}` : ''}.`,
        { ...copy },
      ),
    )
  }
  return issues
}
