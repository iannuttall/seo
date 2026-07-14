import type { CrawlAgentDiscovery } from './agent-discovery.js'
import type { CrawlReport } from './report.js'

export type AgentReadinessCheckStatus =
  | 'pass'
  | 'warning'
  | 'fail'
  | 'unknown'
  | 'notApplicable'
  | 'info'

export type AgentReadinessCheck = {
  id: string
  section: string
  status: AgentReadinessCheckStatus
  title: string
  plainEnglish: string
  action: string
  evidence?: Record<string, unknown>
  urls?: string[]
}

export type AgentReadinessSection = {
  id: string
  title: string
  checks: AgentReadinessCheck[]
}

export type AgentReadinessReport = {
  reportId: string
  url: string
  generatedAt: string
  profile: 'content'
  dataStatus: 'complete' | 'partial' | 'unavailable'
  assessment: 'evidence-only'
  headline: string
  profileApplicability: CrawlAgentDiscovery['profileApplicability']
  summary: {
    checks: number
    passed: number
    warnings: number
    failed: number
    unknown: number
    information: number
    notApplicable: number
  }
  sections: AgentReadinessSection[]
  checks: AgentReadinessCheck[]
  topActions: AgentReadinessCheck[]
  caveats: string[]
}

function check(
  section: string,
  input: Omit<AgentReadinessCheck, 'section'>,
): AgentReadinessCheck {
  return { section, ...input }
}

function section(
  id: string,
  title: string,
  checks: AgentReadinessCheck[],
): AgentReadinessSection {
  return { id, title, checks }
}

function failedMarkdownUrls(discovery: CrawlAgentDiscovery): string[] {
  return discovery.markdownAlternates.pages
    .filter(
      (page) =>
        !page.htmlAlternateUnique ||
        page.httpAlternateUrls.length !== 1 ||
        page.explicit?.status !== 200 ||
        !/^\s*text\/markdown\b/iu.test(page.explicit.contentType ?? '') ||
        page.explicitMatchesNegotiated !== true ||
        page.repeatedHashStable !== true ||
        page.markdownCanonicalMatchesHtml !== true ||
        page.explicit?.varyAccept !== true ||
        page.negotiated?.varyAccept !== true,
    )
    .map((page) => page.htmlUrl)
}

function qualityFailureUrls(discovery: CrawlAgentDiscovery): string[] {
  return discovery.markdownAlternates.pages
    .filter((page) => {
      const quality = page.quality
      if (!quality) return true
      return (
        !quality.frontmatterTitle ||
        quality.h1Count !== 1 ||
        !quality.codeFenceBalanced ||
        quality.rawHtmlTags > 0 ||
        quality.rawSvgTags > 0 ||
        quality.rawScriptTags > 0 ||
        quality.rawStyleTags > 0 ||
        quality.navigationOnly ||
        quality.repeatedLines > 0 ||
        (quality.wordRetentionRatio !== null &&
          quality.wordRetentionRatio < 0.4) ||
        quality.introductoryCopyRetained === false
      )
    })
    .map((page) => page.htmlUrl)
}

function profileChecks(
  discovery: Pick<CrawlAgentDiscovery, 'profile' | 'profileApplicability'>,
): AgentReadinessCheck[] {
  return (['api', 'application', 'commerce'] as const).map((profile) =>
    check('profile', {
      id: `profile-${profile}`,
      status: 'notApplicable',
      title: `${profile[0]?.toUpperCase()}${profile.slice(1)} checks are not applicable`,
      plainEnglish: discovery.profileApplicability[profile].reason,
      action:
        'Choose this profile only when the site exposes that capability publicly.',
      evidence: { profile, selectedProfile: discovery.profile },
    }),
  )
}

function summariseChecks(
  checks: AgentReadinessCheck[],
): AgentReadinessReport['summary'] {
  const count = (status: AgentReadinessCheckStatus) =>
    checks.filter((item) => item.status === status).length
  return {
    checks: checks.length,
    passed: count('pass'),
    warnings: count('warning'),
    failed: count('fail'),
    unknown: count('unknown'),
    information: count('info'),
    notApplicable: count('notApplicable'),
  }
}

function markdownChecks(discovery: CrawlAgentDiscovery): AgentReadinessCheck[] {
  const markdown = discovery.markdownAlternates
  const failedUrls = failedMarkdownUrls(discovery)
  const qualityUrls = qualityFailureUrls(discovery)
  const coverageComplete =
    markdown.eligibleHtmlPages > 0 &&
    markdown.advertisedPages === markdown.eligibleHtmlPages &&
    markdown.evaluatedPages === markdown.eligibleHtmlPages
  const bytesMatch =
    markdown.eligibleHtmlPages > 0 &&
    markdown.exactByteMatches === markdown.eligibleHtmlPages
  const stable =
    markdown.eligibleHtmlPages > 0 &&
    markdown.stableResponses === markdown.eligibleHtmlPages
  const tokenHeaders = markdown.pages.filter(
    (page) =>
      page.explicit?.bytes !== undefined &&
      page.explicit?.markdownTokens !== undefined &&
      page.explicit.markdownTokens === Math.ceil(page.explicit.bytes / 4) &&
      page.explicit.markdownTokens === page.negotiated?.markdownTokens,
  ).length
  return [
    check('representations', {
      id: 'markdown-coverage',
      status:
        markdown.eligibleHtmlPages === 0
          ? 'unknown'
          : coverageComplete
            ? 'pass'
            : 'fail',
      title: coverageComplete
        ? 'Every successful HTML page advertises one Markdown alternative'
        : 'Markdown alternative coverage is incomplete',
      plainEnglish: `${markdown.advertisedPages} of ${markdown.eligibleHtmlPages} successful HTML pages advertised one Markdown alternative, and ${markdown.evaluatedPages} were fetched.`,
      action: coverageComplete
        ? 'Keep route generation tied to the same deterministic page manifest.'
        : 'Add one text/markdown alternate for each public HTML page and make every advertised URL return successfully.',
      evidence: {
        eligibleHtmlPages: markdown.eligibleHtmlPages,
        advertisedPages: markdown.advertisedPages,
        evaluatedPages: markdown.evaluatedPages,
      },
      urls: failedUrls.slice(0, 25),
    }),
    check('representations', {
      id: 'markdown-token-estimates',
      status:
        markdown.evaluatedPages === 0
          ? 'unknown'
          : tokenHeaders === markdown.evaluatedPages
            ? 'pass'
            : 'warning',
      title:
        tokenHeaders === markdown.evaluatedPages
          ? 'Every Markdown response includes the same token estimate'
          : 'Some Markdown responses are missing a stable token estimate',
      plainEnglish: `${tokenHeaders} of ${markdown.evaluatedPages} evaluated pages returned matching X-Markdown-Tokens values on the explicit and negotiated responses. The value is a quick size estimate, not an exact model-specific token count.`,
      action:
        'Generate the estimate from the stored Markdown bytes and return the same value for explicit and negotiated responses.',
      urls: markdown.pages
        .filter(
          (page) =>
            page.explicit?.markdownTokens === undefined ||
            page.explicit.markdownTokens !== page.negotiated?.markdownTokens,
        )
        .map((page) => page.htmlUrl)
        .slice(0, 25),
    }),
    check('representations', {
      id: 'markdown-negotiation',
      status:
        markdown.eligibleHtmlPages === 0
          ? 'unknown'
          : bytesMatch && discovery.contentNegotiation.qZeroHonoured
            ? 'pass'
            : 'fail',
      title:
        bytesMatch && discovery.contentNegotiation.qZeroHonoured
          ? 'Explicit and negotiated Markdown use the same bytes'
          : 'Content negotiation does not match the explicit Markdown contract',
      plainEnglish: `${markdown.exactByteMatches} of ${markdown.eligibleHtmlPages} pages returned identical explicit and negotiated Markdown. A request that refuses Markdown ${discovery.contentNegotiation.qZeroHonoured ? 'received HTML' : 'did not produce confirmed HTML evidence'}.`,
      action:
        'Use one stored Markdown artifact for both routes, honour Accept q-values, and send Vary: Accept on negotiated responses.',
      evidence: {
        exactByteMatches: markdown.exactByteMatches,
        qZero: discovery.contentNegotiation,
      },
      urls: failedUrls.slice(0, 25),
    }),
    check('representations', {
      id: 'markdown-determinism',
      status:
        markdown.eligibleHtmlPages === 0 ? 'unknown' : stable ? 'pass' : 'fail',
      title: stable
        ? 'Repeated Markdown responses are stable'
        : 'Repeated Markdown responses changed during the audit',
      plainEnglish: `${markdown.stableResponses} of ${markdown.eligibleHtmlPages} repeated explicit responses kept the same SHA-256 digest.`,
      action:
        'Generate Markdown during the build and remove runtime rewriting, timestamps, or random output.',
      evidence: { stableResponses: markdown.stableResponses },
      urls: failedUrls.slice(0, 25),
    }),
    check('representations', {
      id: 'markdown-quality',
      status:
        markdown.evaluatedPages === 0
          ? 'unknown'
          : qualityUrls.length === 0
            ? 'pass'
            : 'warning',
      title:
        qualityUrls.length === 0
          ? 'Markdown keeps the useful document structure cleanly'
          : 'Some Markdown alternatives need an extraction review',
      plainEnglish:
        qualityUrls.length === 0
          ? 'The evaluated alternatives retained one H1, frontmatter titles, balanced code fences, useful copy, and no leaked SVG, script, style, or layout tags.'
          : `${qualityUrls.length} Markdown alternative${qualityUrls.length === 1 ? '' : 's'} lost important structure, looked navigation-only, or leaked presentation markup.`,
      action:
        'Open the affected Markdown directly and fix the shared converter or component exclusion rules rather than patching generated files.',
      urls: qualityUrls.slice(0, 25),
    }),
  ]
}

function discoveryChecks(
  discovery: CrawlAgentDiscovery,
): AgentReadinessCheck[] {
  const skills = discovery.agentSkills
  const skillsValid =
    skills.validIndex &&
    skills.skills.length > 0 &&
    skills.skills.every(
      (skill) =>
        skill.sameOrigin &&
        skill.status === 200 &&
        /^\s*text\/markdown\b/iu.test(skill.contentType ?? '') &&
        Boolean(skill.cors) &&
        skill.digestMatches === true &&
        skill.frontmatterValid === true,
    ) &&
    Boolean(skills.cors)
  const llms = discovery.llmsTxt
  const llmsBroken = llms.links.filter(
    (link) => !link.status || link.status < 200 || link.status >= 400,
  )
  const llmsValid =
    llms.exists &&
    /^\s*(?:text\/plain|text\/markdown)\b/iu.test(llms.contentType ?? '') &&
    llms.headingCount > 0 &&
    llms.links.length > 0 &&
    !llms.linkLimitReached &&
    !llms.oversized &&
    llms.invalidLinks.length === 0 &&
    llms.duplicateLinks.length === 0 &&
    llms.redirectedLinks.length === 0 &&
    llms.nonIndexableLinks.length === 0 &&
    llms.missingCrawlRoutes.length === 0 &&
    llmsBroken.length === 0 &&
    llms.repeatedHashStable === true
  return [
    check('discovery', {
      id: 'agent-skills',
      status: skillsValid ? 'pass' : skills.status === 404 ? 'info' : 'warning',
      title: skillsValid
        ? 'Agent Skills discovery is valid and digest verified'
        : 'Agent Skills discovery is absent or needs attention',
      plainEnglish: skillsValid
        ? `${skills.skills.length} published skill${skills.skills.length === 1 ? '' : 's'} matched the declared SHA-256 digest, valid SKILL.md frontmatter, Markdown content type, and cross-origin access policy.`
        : 'Agent Skills is optional for a content site, but a published index should resolve same-origin Markdown skill files, allow intended cross-origin clients, and verify their declared bytes.',
      action:
        'If you publish Agent Skills, keep the discovery index and SHA-256 digests generated from the exact deployed skill bytes.',
      evidence: skills as unknown as Record<string, unknown>,
    }),
    check('discovery', {
      id: 'llms-txt',
      status: llms.exists ? (llmsValid ? 'pass' : 'warning') : 'info',
      title: llms.exists
        ? llmsValid
          ? 'llms.txt is short, stable, and its links resolve'
          : 'llms.txt exists but needs a content or link review'
        : 'llms.txt is not published',
      plainEnglish: llms.exists
        ? `${llms.links.length} declared links were checked. ${llms.invalidLinks.length} were malformed, ${llms.duplicateLinks.length} were duplicated, ${llms.redirectedLinks.length} redirected, ${llms.nonIndexableLinks.length} reached non-indexable pages, ${llmsBroken.length} did not resolve, and ${llms.missingCrawlRoutes.length} were missing from the crawl inventory. ${llms.offSiteLinks.length} linked to other sites.`
        : 'llms.txt is optional and its absence is not a search ranking problem.',
      action: llms.exists
        ? 'Keep the file curated, deterministic, and limited to useful entry points whose links still resolve.'
        : 'Add it only when an intended consumer uses it. Do not treat it as a Google ranking requirement.',
      evidence: {
        status: llms.status,
        contentType: llms.contentType,
        bytes: llms.bytes,
        oversized: llms.oversized,
        totalParsedLinks: llms.totalParsedLinks,
        linkLimitReached: llms.linkLimitReached,
        links: llms.links.length,
        invalidLinks: llms.invalidLinks,
        duplicateLinks: llms.duplicateLinks,
        offSiteLinks: llms.offSiteLinks,
        redirectedLinks: llms.redirectedLinks,
        nonIndexableLinks: llms.nonIndexableLinks,
        missingCrawlRoutes: llms.missingCrawlRoutes,
        repeatedHashStable: llms.repeatedHashStable,
      },
      urls: [
        ...llmsBroken.map((link) => link.url),
        ...llms.redirectedLinks,
        ...llms.nonIndexableLinks,
        ...llms.missingCrawlRoutes,
      ].slice(0, 25),
    }),
    check('discovery', {
      id: 'content-signals',
      status:
        discovery.contentSignals.consistent === null
          ? 'unknown'
          : discovery.contentSignals.consistent
            ? 'pass'
            : 'warning',
      title: discovery.contentSignals.consistent
        ? 'HTML and Markdown publish one explicit Content Signals policy'
        : 'Content Signals are missing or inconsistent across representations',
      plainEnglish: discovery.contentSignals.consistent
        ? `The same ${discovery.contentSignals.htmlValues[0]} policy was observed on every evaluated HTML and Markdown response.`
        : `${discovery.contentSignals.missingHtmlPages} HTML responses and ${discovery.contentSignals.missingMarkdownPages} Markdown responses were missing the header, or the observed values differed.`,
      action:
        'Choose the site policy deliberately and return the same Content-Signal value on HTML and Markdown responses.',
      evidence: discovery.contentSignals,
    }),
    check('discovery', {
      id: 'route-manifest',
      status: !discovery.routeManifest.valid
        ? 'info'
        : discovery.routeManifest.missingHtmlRoutes.length === 0 &&
            discovery.routeManifest.missingMarkdownRoutes.length === 0 &&
            discovery.routeManifest.orphanMarkdownRoutes.length === 0
          ? 'pass'
          : 'warning',
      title: discovery.routeManifest.valid
        ? 'The public route manifest agrees with the crawl'
        : 'No public route manifest was available',
      plainEnglish: discovery.routeManifest.valid
        ? `The manifest declared ${discovery.routeManifest.declaredHtmlRoutes.length} HTML routes and ${discovery.routeManifest.declaredMarkdownRoutes.length} Markdown routes. Missing or orphan routes are listed in the evidence.`
        : 'A public route manifest is optional. Without one, this crawl cannot prove that no orphan Markdown files were deployed.',
      action:
        'Generate one deterministic route inventory from the build when exact HTML and Markdown parity matters.',
      evidence: discovery.routeManifest as unknown as Record<string, unknown>,
    }),
  ]
}

function accessChecks(
  report: CrawlReport,
  discovery: CrawlAgentDiscovery,
): AgentReadinessCheck[] {
  const bots = report.ai?.robotsTxt?.botAccess ?? []
  const blocked = bots.filter((bot) => bot.allowed === false)
  const robotsKnown =
    report.ai?.robotsTxt?.availability === 'available' ||
    report.ai?.robotsTxt?.availability === 'absent'
  const protocol = discovery.protocolVariants
  return [
    check('access', {
      id: 'crawler-access',
      status: !robotsKnown
        ? 'unknown'
        : blocked.length > 0
          ? 'warning'
          : 'pass',
      title: blocked.length
        ? 'robots.txt blocks selected crawler tokens'
        : 'No selected crawler token is blocked at the start URL',
      plainEnglish: robotsKnown
        ? `${blocked.length} of ${bots.length} selected crawler tokens were blocked by the start URL robots.txt policy.`
        : 'The robots.txt response was not stable enough to make a crawler-access claim.',
      action:
        'Keep blocks intentional. A crawler token being allowed here does not prove that the service will crawl, index, or cite the site.',
      evidence: {
        availability: report.ai?.robotsTxt?.availability,
        blocked,
        botAccess: bots,
      },
    }),
    check('access', {
      id: 'protocol-canonicalization',
      status:
        protocol.http.permanentRedirectToHttps === true &&
        protocol.hstsOnStartPage === true
          ? 'pass'
          : protocol.http.permanentRedirectToHttps === null
            ? 'unknown'
            : 'warning',
      title:
        protocol.http.permanentRedirectToHttps === true &&
        protocol.hstsOnStartPage === true
          ? 'HTTP redirects permanently to HTTPS and HTTPS sends HSTS'
          : 'Protocol canonicalization needs attention or could not be proven',
      plainEnglish: `The HTTP variant ${protocol.http.permanentRedirectToHttps === true ? 'redirected permanently to HTTPS' : 'did not produce a confirmed permanent HTTPS redirect'}. The HTTPS start page ${protocol.hstsOnStartPage ? 'sent HSTS' : 'did not provide confirmed HSTS evidence'}.`,
      action:
        'Use one permanent HTTP-to-HTTPS redirect and send HSTS only after HTTPS is stable across the site.',
      evidence: protocol as unknown as Record<string, unknown>,
    }),
  ]
}

function identityChecks(report: CrawlReport): AgentReadinessCheck[] {
  const types = new Set(report.pages.flatMap((page) => page.schemaTypes ?? []))
  const hasSoftware = types.has('SoftwareApplication')
  const hasWebsite = types.has('WebSite')
  const hasCreator = types.has('Person') || types.has('Organization')
  const pageTypes = ['WebPage', 'TechArticle', 'CollectionPage'].filter(
    (type) => types.has(type),
  )
  const officialProfiles = [
    ...new Set(
      report.pages.flatMap((page) => [
        ...(page.schemaSameAs ?? []),
        ...(page.socialProfileLinks ?? []),
      ]),
    ),
  ]
  return [
    check('identity', {
      id: 'identity-graph',
      status:
        hasSoftware && hasWebsite && hasCreator && pageTypes.length > 0
          ? 'pass'
          : 'warning',
      title:
        hasSoftware && hasWebsite && hasCreator && pageTypes.length > 0
          ? 'Structured identity covers the software, website, creator, and pages'
          : 'The structured identity graph is missing a useful entity layer',
      plainEnglish: `Software identity: ${hasSoftware ? 'present' : 'missing'}. Website identity: ${hasWebsite ? 'present' : 'missing'}. Creator or publisher identity: ${hasCreator ? 'present' : 'missing'}. Page-level types: ${pageTypes.length ? pageTypes.join(', ') : 'missing'}.`,
      action:
        'Connect truthful SoftwareApplication, WebSite, creator or publisher, and page nodes. Use sameAs only for official profiles that identify the same entity.',
      evidence: {
        schemaTypes: [...types].sort(),
        officialProfiles: officialProfiles.sort(),
      },
    }),
  ]
}

export function agentReadiness(
  report: CrawlReport & { agentDiscovery?: CrawlAgentDiscovery },
): AgentReadinessReport {
  const discovery = report.agentDiscovery
  if (!discovery) {
    const profiles = {
      content: {
        status: 'evaluated' as const,
        reason:
          'The content profile was selected but discovery evidence was not collected.',
      },
      api: { status: 'notApplicable' as const, reason: 'Not selected.' },
      application: {
        status: 'notApplicable' as const,
        reason: 'Not selected.',
      },
      commerce: { status: 'notApplicable' as const, reason: 'Not selected.' },
    }
    const missing = check('collection', {
      id: 'agent-discovery-evidence',
      status: 'unknown',
      title: 'Agent discovery evidence was not collected',
      plainEnglish:
        'This saved crawl predates the focused content-profile checks or was run without them.',
      action:
        'Run the agent-readiness report with a URL or start a fresh crawl with agent discovery enabled.',
    })
    const profileScope = {
      profile: 'content' as const,
      profileApplicability: profiles,
    }
    const scopeChecks = profileChecks(profileScope)
    const checks = [missing, ...scopeChecks]
    return {
      reportId: report.id,
      url: report.config.url,
      generatedAt: report.generatedAt,
      profile: 'content',
      dataStatus: 'unavailable',
      assessment: 'evidence-only',
      headline:
        'No agent-discovery evidence is stored in this crawl. Run a fresh focused check.',
      profileApplicability: profiles,
      summary: summariseChecks(checks),
      sections: [
        section('collection', 'Evidence collection', [missing]),
        section('profile', 'Profile scope', scopeChecks),
      ],
      checks,
      topActions: [missing],
      caveats: [
        'Not evaluated does not mean absent or broken.',
        'This report does not measure rankings, AI mentions, citations, or selection.',
      ],
    }
  }

  const sections = [
    section('profile', 'Profile scope', profileChecks(discovery)),
    section(
      'access',
      'Crawler and protocol access',
      accessChecks(report, discovery),
    ),
    section(
      'representations',
      'HTML and Markdown representations',
      markdownChecks(discovery),
    ),
    section('discovery', 'Agent discovery files', discoveryChecks(discovery)),
    section('identity', 'Identity evidence', identityChecks(report)),
  ]
  const checks = sections.flatMap((item) => item.checks)
  const actionable = checks.filter((item) =>
    ['fail', 'warning', 'unknown'].includes(item.status),
  )
  const rank: Record<AgentReadinessCheckStatus, number> = {
    fail: 0,
    warning: 1,
    unknown: 2,
    pass: 3,
    info: 4,
    notApplicable: 5,
  }
  const topActions = [...actionable]
    .sort((left, right) => rank[left.status] - rank[right.status])
    .slice(0, 10)
  const summary = summariseChecks(checks)
  return {
    reportId: report.id,
    url: report.config.url,
    generatedAt: report.generatedAt,
    profile: discovery.profile,
    dataStatus: discovery.dataStatus,
    assessment: 'evidence-only',
    headline: `${summary.passed} checks passed, ${summary.warnings} need review, and ${summary.failed} failed for the content profile.`,
    profileApplicability: discovery.profileApplicability,
    summary,
    sections,
    checks,
    topActions,
    caveats: [
      ...report.caveats,
      ...discovery.warnings,
      'A clean content profile does not prove indexing, rankings, AI mentions, citations, or selection.',
      'A crawler token being allowed does not prove that a service fetched or used the page.',
      'API, application, and commerce checks were not applicable to this content-site run.',
    ],
  }
}
