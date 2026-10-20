import type { CrawlReport } from '@seo/core'
import type { SemanticDiagnostic } from './report.js'

type Ai = NonNullable<CrawlReport['ai']>

function list(values: string[]): string {
  return values.length ? values.join(', ') : 'none'
}

function bots(ai: Ai, purpose: 'search' | 'training'): SemanticDiagnostic {
  const robots = ai.robotsTxt
  const group = (robots?.botAccess ?? []).filter(
    (bot) => bot.purpose === purpose,
  )
  const label = purpose === 'search' ? 'AI search bots' : 'AI training bots'
  if (!robots || group.some((bot) => bot.allowed === null)) {
    return {
      status: 'unknown',
      title: `${label}: unknown`,
      explanation: `robots.txt could not be read (${robots?.availability ?? 'not checked'}).`,
    }
  }
  const blocked = group.filter((bot) => bot.allowed === false)
  return {
    status: blocked.length
      ? purpose === 'search'
        ? 'warning'
        : 'info'
      : 'pass',
    title: blocked.length
      ? `${label}: ${blocked.length} of ${group.length} blocked`
      : `${label}: all ${group.length} allowed`,
    explanation: blocked.length
      ? `Blocked: ${list(blocked.map((bot) => bot.userAgent))}.`
      : `Checked: ${list(group.map((bot) => bot.userAgent))}.`,
  }
}

function markdown(ai: Ai): SemanticDiagnostic {
  const negotiation = ai.markdownNegotiation
  const copies = ai.markdownCopies
  const served = negotiation?.markdown
    ? `Accept: text/markdown returns Markdown${negotiation.varyAccept ? ' with Vary: Accept' : ' without Vary: Accept'}.`
    : negotiation?.availability === 'available'
      ? `Accept: text/markdown returns ${negotiation.contentType || 'no content type'}.`
      : `Accept: text/markdown could not be checked (${negotiation?.availability ?? 'not checked'}).`
  const linked = copies
    ? ` ${copies.publicPagesWithLink} of ${copies.publicPages} public pages link to a Markdown copy${copies.privatePagesWithLink ? `, and ${copies.privatePagesWithLink} signed-in pages do` : ''}. ${copies.checked} copies checked, ${copies.broken.length} broken.${copies.largest ? ` Largest checked copy: about ${copies.largest.estimatedTokens} tokens.` : ''}`
    : ''
  return {
    status:
      negotiation?.markdown || copies?.publicPagesWithLink
        ? copies?.broken.length || copies?.privatePagesWithLink
          ? 'warning'
          : 'pass'
        : negotiation?.availability === 'available'
          ? 'info'
          : 'unknown',
    title: 'Markdown copies',
    explanation: `${served}${linked}`,
  }
}

function llmsTxt(ai: Ai): SemanticDiagnostic {
  const file = ai.llmsTxt
  if (!file || file.availability === undefined)
    return { status: 'unknown', title: 'llms.txt', explanation: 'Not checked.' }
  if (file.availability !== 'available')
    return {
      status: file.availability === 'absent' ? 'info' : 'unknown',
      title: 'llms.txt',
      explanation:
        file.availability === 'absent'
          ? `Not found (HTTP ${file.status ?? 'none'}).`
          : `Could not be read (${file.availability}).`,
    }
  const links = file.links
  return {
    status: links?.broken.length ? 'warning' : 'pass',
    title: 'llms.txt',
    explanation: links
      ? `${links.found} same-site links; ${links.checked} checked, ${links.broken.length} broken.`
      : 'Present.',
  }
}

// The agent-access facts from a crawl, for the CLI summary.
export function agentAccessDiagnostics(
  ai: CrawlReport['ai'],
): SemanticDiagnostic[] {
  if (!ai) return []
  const files = (ai.agentResources ?? [])
    .filter((resource) => resource.exists)
    .map((resource) => new URL(resource.url).pathname)
  const signals = [
    ...(ai.robotsTxt?.contentSignals ?? []),
    ...(ai.startPageHeaders?.contentSignal
      ? [ai.startPageHeaders.contentSignal]
      : []),
  ]
  return [
    bots(ai, 'search'),
    bots(ai, 'training'),
    markdown(ai),
    llmsTxt(ai),
    {
      status: 'info',
      title: 'Agent files',
      explanation: `Found: ${list(files)}.`,
    },
    {
      status: 'info',
      title: 'Content-Signal and Link header',
      explanation: `Content-Signal: ${list([...new Set(signals)])}. Link header relations on the start page: ${list(ai.startPageHeaders?.linkRelations ?? [])}.`,
    },
  ]
}
