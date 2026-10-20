import { explainRule, type RuleId } from '../../rules.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import type { CrawlAiSignals, CrawlIssue } from './report.js'

// A page that needs a sign-in. Only these pages should have no Markdown copy.
// noindex does not make a page private: agents may still read it.
export function needsSignIn(page: CrawlPageSnapshot): boolean {
  return (
    page.status === 401 ||
    page.status === 403 ||
    Boolean(page.softAuthenticationGate)
  )
}

// A public page: HTML that loads without a sign-in.
export function isPublicPage(page: CrawlPageSnapshot): boolean {
  return (
    page.status >= 200 &&
    page.status < 300 &&
    !needsSignIn(page) &&
    /\btext\/html\b/i.test(page.contentType ?? '')
  )
}

// Pages expected to have a Markdown copy: public pages search engines may
// index. A noindex page may have one, but it is not expected.
function expectsMarkdown(page: CrawlPageSnapshot): boolean {
  return isPublicPage(page) && page.indexable
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

  const expected = input.pages.filter(expectsMarkdown)
  const linked = expected.filter((page) => page.markdownAlternates?.length)
  const negotiation = ai.markdownNegotiation
  if (
    expected.length &&
    !linked.length &&
    negotiation?.availability === 'available' &&
    !negotiation.markdown
  ) {
    issues.push(
      issue(
        'markdown_missing',
        startUrl,
        `Accept: text/markdown returned ${negotiation.contentType || 'no content type'}, and none of ${expected.length} public pages links to a Markdown copy.`,
        { negotiation },
      ),
    )
  }
  if (linked.length) {
    for (const page of expected) {
      if (page.markdownAlternates?.length) continue
      issues.push(
        issue(
          'markdown_alternate_missing',
          page.url,
          `${linked.length} of ${expected.length} public pages link to a Markdown copy; this one does not.`,
        ),
      )
    }
  }

  for (const page of input.pages) {
    if (!needsSignIn(page) || !page.markdownAlternates?.length) continue
    issues.push(
      issue(
        'markdown_alternate_on_private_page',
        page.url,
        `The page needs a sign-in but links to a Markdown copy at ${page.markdownAlternates[0]}.`,
        { markdownAlternates: page.markdownAlternates },
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
