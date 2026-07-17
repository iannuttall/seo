import type {
  AgentEndpointObservation,
  CrawlAgentDiscovery,
} from './agent-discovery.js'
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
    .filter((page) => {
      const negotiatedOk =
        page.negotiated?.status === 200 &&
        /^\s*text\/markdown\b/iu.test(page.negotiated.contentType ?? '') &&
        page.negotiated.varyAccept
      const explicitOk = !page.htmlAlternateUnique
        ? true
        : page.httpAlternateUrls.length === 1 &&
          page.explicit?.status === 200 &&
          /^\s*text\/markdown\b/iu.test(page.explicit.contentType ?? '') &&
          page.explicitMatchesNegotiated === true &&
          page.markdownCanonicalMatchesHtml === true
      return !negotiatedOk || !explicitOk || page.repeatedHashStable !== true
    })
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
          quality.wordRetentionRatio < 0.4)
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
  const negotiatedPages = markdown.pages.filter(
    (page) =>
      page.negotiated?.status === 200 &&
      /^\s*text\/markdown\b/iu.test(page.negotiated.contentType ?? ''),
  ).length
  const explicitPages = markdown.pages.filter(
    (page) => page.htmlAlternateUnique,
  ).length
  const coverageComplete =
    markdown.eligibleHtmlPages > 0 &&
    markdown.evaluatedPages === markdown.eligibleHtmlPages
  const negotiationComplete =
    markdown.eligibleHtmlPages > 0 &&
    negotiatedPages === markdown.eligibleHtmlPages &&
    markdown.pages.every((page) => page.negotiated?.varyAccept) &&
    markdown.pages.every(
      (page) =>
        !page.htmlAlternateUnique || page.explicitMatchesNegotiated === true,
    )
  const stable =
    markdown.eligibleHtmlPages > 0 &&
    markdown.stableResponses === markdown.eligibleHtmlPages
  const tokenHeaders = markdown.pages.filter((page) => {
    const primary = page.explicit ?? page.negotiated
    return (
      primary?.markdownTokens !== undefined &&
      (!page.explicit ||
        !page.negotiated ||
        page.explicit.markdownTokens === page.negotiated.markdownTokens)
    )
  }).length
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
        ? 'Every successful HTML page has a Markdown representation'
        : 'Markdown representation coverage is incomplete',
      plainEnglish: `${markdown.evaluatedPages} of ${markdown.eligibleHtmlPages} successful HTML pages returned Markdown. ${explicitPages} advertised an explicit alternative and ${negotiatedPages} supported content negotiation.`,
      action: coverageComplete
        ? 'Keep the negotiated or explicit Markdown response stable as routes change.'
        : 'Return text/markdown through content negotiation or advertise one working Markdown alternative for each public HTML page.',
      evidence: {
        eligibleHtmlPages: markdown.eligibleHtmlPages,
        advertisedPages: markdown.advertisedPages,
        negotiatedPages,
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
          ? 'Every Markdown response includes a token estimate'
          : 'Some Markdown responses are missing a stable token estimate',
      plainEnglish: `${tokenHeaders} of ${markdown.evaluatedPages} evaluated pages returned X-Markdown-Tokens. Paired explicit and negotiated responses agreed where both existed. The value is an estimate, not an exact model-specific token count.`,
      action:
        'Return a stable token estimate and keep it consistent when both explicit and negotiated responses exist.',
      urls: markdown.pages
        .filter((page) => {
          const primary = page.explicit ?? page.negotiated
          return (
            primary?.markdownTokens === undefined ||
            (page.explicit !== undefined &&
              page.negotiated !== undefined &&
              page.explicit.markdownTokens !== page.negotiated.markdownTokens)
          )
        })
        .map((page) => page.htmlUrl)
        .slice(0, 25),
    }),
    check('representations', {
      id: 'markdown-negotiation',
      status:
        markdown.eligibleHtmlPages === 0
          ? 'unknown'
          : negotiationComplete && discovery.contentNegotiation.qZeroHonoured
            ? 'pass'
            : 'fail',
      title:
        negotiationComplete && discovery.contentNegotiation.qZeroHonoured
          ? 'Markdown content negotiation works across the site'
          : 'Markdown content negotiation needs attention',
      plainEnglish: `${negotiatedPages} of ${markdown.eligibleHtmlPages} pages returned negotiated Markdown. ${markdown.exactByteMatches} of ${explicitPages} paired explicit responses matched byte for byte. A request that refuses Markdown ${discovery.contentNegotiation.qZeroHonoured ? 'received HTML' : 'did not produce confirmed HTML evidence'}.`,
      action:
        'Honour Accept q-values, send Vary: Accept, and keep paired explicit and negotiated responses identical when both exist.',
      evidence: {
        negotiatedPages,
        explicitPages,
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
      plainEnglish: `${markdown.stableResponses} of ${markdown.eligibleHtmlPages} repeated Markdown responses kept the same SHA-256 digest.`,
      action:
        'Remove timestamps, random output, or other runtime rewriting that changes the same Markdown response between requests.',
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

function contentSignalsCheck(
  discovery: CrawlAgentDiscovery,
  robotsContentSignals: string[] | undefined,
): AgentReadinessCheck {
  const signals = discovery.contentSignals
  const robotsDeclared = robotsContentSignals ?? []
  const robotsCollected = robotsContentSignals !== undefined
  const headersObserved =
    signals.htmlValues.length > 0 || signals.markdownValues.length > 0
  const headersConsistent = signals.consistent === true
  const evidence = {
    robotsDirectives: robotsDeclared,
    robotsDirectivesCollected: robotsCollected,
    ...signals,
  }
  if (headersConsistent) {
    return check('discovery', {
      id: 'content-signals',
      status: 'pass',
      title: 'Every response publishes one explicit Content Signals policy',
      plainEnglish: `The same ${signals.htmlValues[0]} policy was observed on every evaluated HTML and Markdown response${robotsDeclared.length ? ', and robots.txt declares a Content-Signal directive' : ''}.`,
      action:
        'Keep the same Content-Signal value on robots.txt, HTML, and Markdown responses when the policy changes.',
      evidence,
    })
  }
  if (robotsDeclared.length > 0 && !headersObserved) {
    return check('discovery', {
      id: 'content-signals',
      status: 'pass',
      title: 'robots.txt declares a Content Signals policy',
      plainEnglish: `robots.txt declares ${robotsDeclared.length === 1 ? 'one Content-Signal directive' : `${robotsDeclared.length} Content-Signal directives`}. No response-header variant was observed, which is fine because robots.txt is the primary published location.`,
      action:
        'Keep the robots.txt directive as the single policy, or mirror the same value in response headers if you add them.',
      evidence,
    })
  }
  if (robotsDeclared.length > 0 || headersObserved) {
    return check('discovery', {
      id: 'content-signals',
      status: 'warning',
      title: 'Content Signals are published inconsistently',
      plainEnglish: `${signals.missingHtmlPages} HTML responses and ${signals.missingMarkdownPages} Markdown responses were missing the header, the observed values differed, or the header policy does not line up with robots.txt.`,
      action:
        'Choose the site policy deliberately and publish the same Content-Signal value everywhere it appears.',
      evidence,
    })
  }
  if (signals.consistent === null && !robotsCollected) {
    return check('discovery', {
      id: 'content-signals',
      status: 'unknown',
      title: 'Content Signals evidence was not collected',
      plainEnglish:
        'No pages were evaluated for the header and robots.txt directive evidence is unavailable in this crawl.',
      action:
        'Re-run the report with a URL so robots.txt and response headers can be checked.',
      evidence,
    })
  }
  return check('discovery', {
    id: 'content-signals',
    status: 'info',
    title: 'No Content Signals policy is published',
    plainEnglish:
      'Neither robots.txt nor the evaluated responses declare a Content-Signal policy. Publishing one is optional.',
    action:
      'Add a Content-Signal directive to robots.txt only when you want to state an explicit search, ai-input, or ai-train preference.',
    evidence,
  })
}

function discoveryChecks(
  discovery: CrawlAgentDiscovery,
  robotsContentSignals: string[] | undefined,
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
    contentSignalsCheck(discovery, robotsContentSignals),
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

type OptionalEndpointCopy = {
  id: string
  subject: string
  absent: string
  absentAction: string
  presentAction: string
  requiredNote: string
}

function optionalEndpointCheck(
  endpoints: AgentEndpointObservation[],
  copy: OptionalEndpointCopy,
): AgentReadinessCheck {
  const found = endpoints.filter((endpoint) => endpoint.exists)
  const evidence = { endpoints } as unknown as Record<string, unknown>
  if (found.length === 0) {
    return check('endpoints', {
      id: copy.id,
      status: 'info',
      title: `${copy.subject} is not published`,
      plainEnglish: copy.absent,
      action: copy.absentAction,
      evidence,
    })
  }
  const valid = found.filter(
    (endpoint) =>
      endpoint.validJson !== false &&
      (endpoint.missingFields ?? []).length === 0,
  )
  if (valid.length > 0) {
    return check('endpoints', {
      id: copy.id,
      status: 'pass',
      title: `${copy.subject} is published and parses`,
      plainEnglish: `${valid[0]?.url} returned ${valid[0]?.contentType ?? 'a response'} with the expected structure. ${copy.requiredNote}`,
      action: copy.presentAction,
      evidence,
      urls: valid.map((endpoint) => endpoint.url),
    })
  }
  const broken = found[0]
  return check('endpoints', {
    id: copy.id,
    status: 'warning',
    title: `${copy.subject} is published but needs review`,
    plainEnglish: `${broken?.url} responded, but ${broken?.validJson === false ? 'the body is not valid JSON' : `required fields are missing: ${(broken?.missingFields ?? []).join(', ')}`}. ${copy.requiredNote}`,
    action: copy.presentAction,
    evidence,
    urls: found.map((endpoint) => endpoint.url),
  })
}

function endpointChecks(discovery: CrawlAgentDiscovery): AgentReadinessCheck[] {
  const endpointDiscovery = discovery.endpointDiscovery
  if (!endpointDiscovery) {
    return [
      check('endpoints', {
        id: 'agent-endpoints-evidence',
        status: 'unknown',
        title: 'Agent endpoint evidence was not collected',
        plainEnglish:
          'This saved crawl predates the Link header and well-known endpoint probes, so that evidence is unavailable.',
        action:
          'Run the agent-readiness report with a URL to collect endpoint evidence.',
      }),
    ]
  }
  const byId = new Map(
    endpointDiscovery.endpoints.map((endpoint) => [endpoint.id, endpoint]),
  )
  const pick = (...ids: string[]): AgentEndpointObservation[] =>
    ids
      .map((id) => byId.get(id))
      .filter((endpoint): endpoint is AgentEndpointObservation =>
        Boolean(endpoint),
      )
  const linkHeader = endpointDiscovery.linkHeader
  const advertisedRels = [
    ...linkHeader.registeredRels,
    ...linkHeader.emergingRels,
  ]
  const linkHeaderCheck = check('endpoints', {
    id: 'link-headers',
    status: linkHeader.error
      ? 'unknown'
      : advertisedRels.length > 0
        ? 'pass'
        : 'info',
    title: linkHeader.error
      ? 'Link header evidence was not collected'
      : advertisedRels.length > 0
        ? 'The start page Link header advertises agent resources'
        : linkHeader.entries.length > 0
          ? 'Link headers exist but advertise no agent resources'
          : 'No Link header advertises agent resources',
    plainEnglish: linkHeader.error
      ? `The start page request failed: ${linkHeader.error}`
      : advertisedRels.length > 0
        ? `${linkHeader.entries.length} Link header ${linkHeader.entries.length === 1 ? 'entry was' : 'entries were'} observed. Registered relation types: ${linkHeader.registeredRels.join(', ') || 'none'}. Emerging relation types: ${linkHeader.emergingRels.join(', ') || 'none'}.`
        : linkHeader.entries.length > 0
          ? `${linkHeader.entries.length} Link header ${linkHeader.entries.length === 1 ? 'entry was' : 'entries were'} observed, but none used a recognised agent relation type such as api-catalog, service-desc, service-doc, describedby, llms-txt, or agent-skills.`
          : 'The start page response includes no Link header. Advertising machine-readable resources this way is optional.',
    action:
      'Advertise real machine-readable resources with Link response headers. Use registered relation types such as api-catalog and service-desc, and emerging types such as llms-txt only when the target resolves.',
    evidence: linkHeader as unknown as Record<string, unknown>,
  })
  return [
    linkHeaderCheck,
    optionalEndpointCheck(pick('mcp-server-card', 'mcp-server-cards'), {
      id: 'mcp-server-card',
      subject: 'An MCP server card',
      absent:
        'Neither /.well-known/mcp/server-card.json nor server-cards.json returned a machine-readable document. The server card format is a draft MCP proposal, and a content site does not need one.',
      absentAction:
        'Publish a server card only when the site exposes a real public MCP endpoint.',
      presentAction:
        'Keep serverInfo, the transport endpoint, and capabilities accurate for the deployed MCP server.',
      requiredNote:
        'The server card format is a draft MCP proposal, so this is a structural observation rather than a compliance verdict.',
    }),
    optionalEndpointCheck(pick('a2a-agent-card'), {
      id: 'a2a-agent-card',
      subject: 'An A2A agent card',
      absent:
        '/.well-known/agent-card.json returned no machine-readable document. Agent cards matter only for sites that expose an agent-to-agent endpoint.',
      absentAction:
        'Publish an agent card only when the site hosts a real A2A endpoint.',
      presentAction:
        'Keep the agent card name, url, and capabilities aligned with the deployed endpoint.',
      requiredNote:
        'A2A is an emerging protocol, so this is a structural observation rather than a compliance verdict.',
    }),
    optionalEndpointCheck(
      pick('openid-configuration', 'oauth-authorization-server'),
      {
        id: 'oauth-discovery',
        subject: 'OAuth or OpenID Connect discovery metadata',
        absent:
          'No authorization-server metadata was found at /.well-known/openid-configuration or /.well-known/oauth-authorization-server. That only matters when the site exposes protected APIs that agents authenticate with.',
        absentAction:
          'Publish RFC 8414 or OpenID Connect discovery metadata only when a real authorization server issues tokens for this origin.',
        presentAction:
          'Keep the issuer and endpoint URLs accurate so clients can discover how to authenticate.',
        requiredNote:
          'Structural presence of issuer metadata does not prove the authorization flow works.',
      },
    ),
    optionalEndpointCheck(pick('oauth-protected-resource'), {
      id: 'oauth-protected-resource',
      subject: 'OAuth protected resource metadata',
      absent:
        '/.well-known/oauth-protected-resource returned no metadata. RFC 9728 metadata matters only for origins that serve OAuth-protected APIs.',
      absentAction:
        'Publish protected resource metadata only when this origin actually serves OAuth-protected APIs.',
      presentAction:
        'Keep the resource identifier and authorization_servers list accurate.',
      requiredNote:
        'Structural presence does not prove tokens are issued or accepted.',
    }),
    optionalEndpointCheck(pick('api-catalog'), {
      id: 'api-catalog',
      subject: 'An API catalog',
      absent:
        '/.well-known/api-catalog returned no linkset document. An RFC 9727 catalog matters only for sites that publish APIs.',
      absentAction: 'Publish an API catalog only when the site has real APIs.',
      presentAction:
        'Keep the linkset entries pointing at live service-desc and service-doc resources.',
      requiredNote:
        'The catalog was checked for structure only, not for whether each linked API works.',
    }),
    optionalEndpointCheck(pick('web-bot-auth-directory'), {
      id: 'web-bot-auth',
      subject: 'A Web Bot Auth key directory',
      absent:
        '/.well-known/http-message-signatures-directory returned no key set. Publishing one matters only for operators that sign their own outbound bot requests.',
      absentAction:
        'Publish a signature directory only when this origin operates bots that sign requests with Web Bot Auth.',
      presentAction: 'Keep the published keys current and rotate them safely.',
      requiredNote:
        'Web Bot Auth is an emerging draft, so this is a structural observation rather than a compliance verdict.',
    }),
    optionalEndpointCheck(pick('auth-md'), {
      id: 'auth-md',
      subject: 'An auth.md registration guide',
      absent:
        '/auth.md returned no document. auth.md is an emerging proposal for telling agents how to register and authenticate, and most content sites do not need one.',
      absentAction:
        'Add auth.md only when agents can genuinely register for and authenticate with this site.',
      presentAction:
        'Keep the registration steps accurate and pair the file with real OAuth discovery metadata.',
      requiredNote:
        'auth.md is an emerging proposal, so this is a presence observation only.',
    }),
    optionalEndpointCheck(pick('llms-full-txt'), {
      id: 'llms-full-txt',
      subject: 'llms-full.txt',
      absent:
        '/llms-full.txt returned no document. The expanded companion to llms.txt is optional, and its absence is not a search ranking problem.',
      absentAction:
        'Add llms-full.txt only when an intended consumer wants the full expanded content in one file.',
      presentAction:
        'Keep the file deterministic and consistent with the curated llms.txt entry points.',
      requiredNote:
        'Only presence and content type were checked, not the quality of the expanded content.',
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
        hasWebsite && hasCreator && pageTypes.length > 0 ? 'pass' : 'warning',
      title:
        hasWebsite && hasCreator && pageTypes.length > 0
          ? 'Structured identity covers the website, creator, and pages'
          : 'The structured identity graph is missing a useful entity layer',
      plainEnglish: `Website identity: ${hasWebsite ? 'present' : 'missing'}. Creator or publisher identity: ${hasCreator ? 'present' : 'missing'}. Page-level types: ${pageTypes.length ? pageTypes.join(', ') : 'missing'}. Software identity: ${hasSoftware ? 'present' : 'not observed and not required for a content site'}.`,
      action:
        'Connect truthful WebSite, creator or publisher, and page nodes. Add SoftwareApplication only when the site actually represents software. Use sameAs only for official profiles that identify the same entity.',
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
    section(
      'discovery',
      'Agent discovery files',
      discoveryChecks(discovery, report.ai?.robotsTxt?.contentSignals),
    ),
    section(
      'endpoints',
      'Agent endpoints and auth discovery',
      endpointChecks(discovery),
    ),
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
      'MCP server cards, A2A agent cards, Web Bot Auth directories, and auth.md are emerging conventions. Their absence is an observation, not a defect.',
      'API, application, and commerce checks were not applicable to this content-site run.',
    ],
  }
}
