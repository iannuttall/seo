import type { CrawlAgentDiscovery } from './agent-discovery-types.js'
import type { AgentReadinessCheck } from './agent-readiness.js'
import type { CrawlReport } from './report.js'

const MIN_RAW_CHARACTERS = 500
const TRUST_ANCHOR_REVIEW_CHARACTERS = 500

function check(
  input: Omit<AgentReadinessCheck, 'section'>,
): AgentReadinessCheck {
  return { section: 'public-site', ...input }
}

function isMissingStatus(status: number | undefined): boolean {
  return status === 404 || status === 410
}

function isSuccessful(status: number | undefined): boolean {
  return status !== undefined && status >= 200 && status < 300
}

function rawHtmlCheck(discovery: CrawlAgentDiscovery): AgentReadinessCheck {
  const raw = discovery.siteSurfaces?.rawStartPage
  if (!raw || raw.error || raw.bodyLimitExceeded) {
    return check({
      id: 'raw-html-content',
      status: 'unknown',
      title: 'Raw start-page content was not fully collected',
      plainEnglish:
        'The bounded HTML request failed or exceeded its response limit, so the report cannot state what a client sees without JavaScript.',
      action:
        'Fetch the start page again and confirm that the first response contains the main text and one H1 before any script runs.',
      evidence: raw,
    })
  }
  const html = /\b(?:text\/html|application\/xhtml\+xml)\b/iu.test(
    raw.contentType ?? '',
  )
  const useful =
    isSuccessful(raw.status) &&
    html &&
    (raw.characters ?? 0) >= MIN_RAW_CHARACTERS &&
    (raw.h1Count ?? 0) >= 1 &&
    (raw.maximumHeadingSkip ?? 0) <= 1
  return check({
    id: 'raw-html-content',
    status: useful ? 'pass' : 'warning',
    title: useful
      ? 'The raw start page contains useful document content'
      : 'The raw start page needs a content review',
    plainEnglish: `The initial response returned status ${raw.status ?? 'unknown'} with ${raw.characters ?? 0} text characters, ${raw.wordCount ?? 0} words, ${raw.h1Count ?? 0} H1 ${(raw.h1Count ?? 0) === 1 ? 'heading' : 'headings'}, and a maximum heading-level skip of ${raw.maximumHeadingSkip ?? 0}. The ${MIN_RAW_CHARACTERS}-character review point identifies near-empty documents. It is a heuristic, not an agent or search-engine rule.`,
    action: useful
      ? 'Keep the main page text and one clear H1 in the initial HTML as the design changes.'
      : 'Put the main public text and one clear H1 in the server response. Keep the heading order logical when the page needs subheadings.',
    evidence: {
      ...raw,
      minimumReviewCharacters: MIN_RAW_CHARACTERS,
      heuristic: true,
    },
    urls: [raw.requestedUrl],
  })
}

function notFoundCheck(discovery: CrawlAgentDiscovery): AgentReadinessCheck {
  const notFound = discovery.siteSurfaces?.notFound
  if (!notFound) {
    return check({
      id: 'agent-friendly-404s',
      status: 'unknown',
      title: 'Missing-page recovery was not collected',
      plainEnglish:
        'This saved crawl has no explicit request for a path that should not exist.',
      action:
        'Run a fresh agent-readiness report so the missing HTML and Markdown responses can be checked.',
    })
  }
  const htmlStatusOk = isMissingStatus(notFound.html.status)
  const markdownStatusOk = isMissingStatus(notFound.markdown.status)
  const markdownType = /\btext\/markdown\b/iu.test(
    notFound.markdown.contentType ?? '',
  )
  const recoveryLinks = (notFound.markdown.links ?? []).filter((value) => {
    const path = new URL(value).pathname
    return (
      path === '/' ||
      path === '/sitemap.xml' ||
      path.endsWith('/llms.txt') ||
      path === '/docs' ||
      path.startsWith('/docs/')
    )
  })
  const recoverable =
    htmlStatusOk &&
    markdownStatusOk &&
    markdownType &&
    (notFound.markdown.h1Count ?? 0) >= 1 &&
    recoveryLinks.length > 0
  const falseSuccess =
    isSuccessful(notFound.html.status) || isSuccessful(notFound.markdown.status)
  const status = falseSuccess ? 'fail' : recoverable ? 'pass' : 'warning'
  return check({
    id: 'agent-friendly-404s',
    status,
    title:
      status === 'fail'
        ? 'A missing path returned a false success response'
        : recoverable
          ? 'Missing paths fail clearly and provide Markdown recovery links'
          : 'Missing paths fail clearly but need a better agent recovery body',
    plainEnglish: `The HTML request returned ${notFound.html.status ?? 'no status'} and the Markdown request returned ${notFound.markdown.status ?? 'no status'}. The Markdown response used ${notFound.markdown.contentType ?? 'no content type'}, contained ${notFound.markdown.h1Count ?? 0} top-level ${(notFound.markdown.h1Count ?? 0) === 1 ? 'heading' : 'headings'}, and linked to ${recoveryLinks.length} known recovery ${recoveryLinks.length === 1 ? 'resource' : 'resources'}.`,
    action: falseSuccess
      ? 'Return HTTP 404 or 410 for paths that do not exist. Do not return the normal app shell with status 200.'
      : recoverable
        ? 'Keep the status and recovery links covered when routing or hosting changes.'
        : 'Keep the 404 or 410 status and return a short text/markdown body with a heading plus links to the sitemap, llms.txt, or docs index when Markdown is requested.',
    evidence: {
      path: notFound.path,
      html: notFound.html,
      markdown: notFound.markdown,
      recoveryLinks,
    },
    urls: [notFound.html.requestedUrl],
  })
}

function developerResourceCheck(
  report: CrawlReport,
  discovery: CrawlAgentDiscovery,
): AgentReadinessCheck {
  const resourcePattern =
    /\b(?:api|developers?|documentation|docs?|openapi|webhooks?|mcp|authentication|auth)\b/iu
  const startLinks = discovery.siteSurfaces?.rawStartPage.links ?? []
  const htmlResources = startLinks.filter((value) =>
    resourcePattern.test(new URL(value).pathname),
  )
  const llmsResources = discovery.llmsTxt.links
    .filter((link) =>
      resourcePattern.test(`${new URL(link.url).pathname} ${link.label}`),
    )
    .filter(
      (link) =>
        link.status !== undefined && link.status >= 200 && link.status < 400,
    )
    .map((link) => link.url)
  const headerResources =
    discovery.endpointDiscovery?.linkHeader.entries
      .filter((entry) =>
        entry.rel.some((rel) =>
          ['api-catalog', 'service-desc', 'service-doc'].includes(rel),
        ),
      )
      .map((entry) => entry.url) ?? []
  const endpointResources =
    discovery.endpointDiscovery?.endpoints
      .filter((endpoint) => endpoint.exists)
      .map((endpoint) => endpoint.url) ?? []
  const resources = [
    ...new Set([
      ...htmlResources,
      ...llmsResources,
      ...headerResources,
      ...endpointResources,
    ]),
  ].sort()
  const softwareSite = report.pages.some((page) =>
    page.schemaTypes?.includes('SoftwareApplication'),
  )
  return check({
    id: 'developer-resource-links',
    status: resources.length > 0 ? 'pass' : softwareSite ? 'warning' : 'info',
    title:
      resources.length > 0
        ? 'Developer resources have named public entry points'
        : softwareSite
          ? 'No named developer resource entry point was found'
          : 'No public developer surface was detected',
    plainEnglish:
      resources.length > 0
        ? `${resources.length} developer resource ${resources.length === 1 ? 'URL was' : 'URLs were'} found through the start page, llms.txt, Link headers, or known machine-readable endpoints.`
        : softwareSite
          ? 'SoftwareApplication evidence was observed, but the start page, llms.txt, Link headers, and known endpoints did not expose a predictable developer resource URL.'
          : 'The content profile found no direct evidence that this site publishes an API, MCP endpoint, webhook surface, or developer portal.',
    action:
      resources.length > 0
        ? 'Keep product names in the resource title and heading, and keep the advertised URLs live.'
        : softwareSite
          ? 'Link the real API docs, OpenAPI description, MCP endpoint, auth guide, or developer portal from the start page or llms.txt. Do not advertise a surface that does not exist.'
          : 'No change is required unless the site publishes a developer surface.',
    evidence: {
      softwareSite,
      htmlResources,
      llmsResources,
      headerResources,
      endpointResources,
      externalBrandSearchEvaluated: false,
    },
    urls: resources.slice(0, 25),
  })
}

function whenToUseCheck(discovery: CrawlAgentDiscovery): AgentReadinessCheck {
  const skillGuidance = discovery.agentSkills.skills
    .filter((skill) => skill.whenToUseGuidance === true)
    .map((skill) => skill.url)
    .filter((value): value is string => Boolean(value))
  const llmsGuidance = discovery.llmsTxt.whenToUseGuidance === true
  const publishesInstructions =
    discovery.agentSkills.skills.length > 0 || discovery.llmsTxt.exists
  const present = llmsGuidance || skillGuidance.length > 0
  return check({
    id: 'agent-when-to-use',
    status: present ? 'pass' : publishesInstructions ? 'warning' : 'info',
    title: present
      ? 'Agent instructions state when to use the site or skill'
      : publishesInstructions
        ? 'Published agent instructions lack specific when-to-use guidance'
        : 'No agent instruction surface was detected',
    plainEnglish: present
      ? `Specific guidance was found in ${skillGuidance.length} Agent Skill ${skillGuidance.length === 1 ? 'file' : 'files'}${llmsGuidance ? ' and the llms.txt summary' : ''}.`
      : publishesInstructions
        ? 'The site publishes llms.txt or Agent Skills, but the checked summary, descriptions, and headings did not name a specific job or condition for using them.'
        : 'No llms.txt or Agent Skill was available for this optional guidance check.',
    action: present
      ? 'Keep the guidance tied to real jobs and update it when the public capability changes.'
      : publishesInstructions
        ? 'Add specific use cases to the Agent Skill description or a clear llms.txt summary. Name the jobs the site is suitable for and the public entry point an agent should use.'
        : 'Add agent instructions only when an intended agent consumer needs them.',
    evidence: {
      llmsTxt: {
        exists: discovery.llmsTxt.exists,
        whenToUseGuidance: discovery.llmsTxt.whenToUseGuidance,
        guidanceSource: discovery.llmsTxt.guidanceSource,
      },
      skills: discovery.agentSkills.skills.map((skill) => ({
        name: skill.name,
        url: skill.url,
        whenToUseGuidance: skill.whenToUseGuidance,
        guidanceSource: skill.guidanceSource,
      })),
    },
    urls: skillGuidance,
  })
}

function trustAnchorCheck(discovery: CrawlAgentDiscovery): AgentReadinessCheck {
  const pages = discovery.siteSurfaces?.trustAnchors
  if (!pages) {
    return check({
      id: 'trust-anchor-pages',
      status: 'unknown',
      title: 'Trust-page evidence was not collected',
      plainEnglish:
        'This saved crawl has no direct observations for the predictable about, contact, and privacy paths.',
      action:
        'Run a fresh agent-readiness report to check the three public paths.',
    })
  }
  const missing = pages.filter((page) => !isSuccessful(page.status))
  const short = pages.filter(
    (page) =>
      isSuccessful(page.status) &&
      (page.characters ?? 0) < TRUST_ANCHOR_REVIEW_CHARACTERS,
  )
  const complete = missing.length === 0 && short.length === 0
  return check({
    id: 'trust-anchor-pages',
    status: complete ? 'pass' : 'warning',
    title: complete
      ? 'About, contact, and privacy pages contain public content'
      : 'Trust-page coverage or content needs review',
    plainEnglish: `${pages.length - missing.length} of ${pages.length} predictable trust pages returned a successful response. ${short.length} successful pages contained fewer than ${TRUST_ANCHOR_REVIEW_CHARACTERS} extracted characters. This size is a review heuristic and does not prove that a person or business is legitimate.`,
    action: complete
      ? 'Keep ownership, contact routes, and privacy terms accurate as the site changes.'
      : 'Publish accurate about, contact, and privacy pages at predictable paths. Add enough specific content to explain ownership, how to make contact, and how data is handled.',
    evidence: {
      pages,
      missing: missing.map((page) => page.id),
      short: short.map((page) => page.id),
      reviewCharacters: TRUST_ANCHOR_REVIEW_CHARACTERS,
      heuristic: true,
    },
    urls: [...missing, ...short].map((page) => page.requestedUrl),
  })
}

export function publicSiteChecks(
  report: CrawlReport,
  discovery: CrawlAgentDiscovery,
): AgentReadinessCheck[] {
  return [
    rawHtmlCheck(discovery),
    notFoundCheck(discovery),
    developerResourceCheck(report, discovery),
    whenToUseCheck(discovery),
    trustAnchorCheck(discovery),
  ]
}
