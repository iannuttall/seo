import type { CrawlAgentDiscovery } from './agent-discovery.js'
import type { AgentReadinessCheck } from './agent-readiness.js'

function check(
  section: string,
  input: Omit<AgentReadinessCheck, 'section'>,
): AgentReadinessCheck {
  return { section, ...input }
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
        (quality.contentSketchCoverage !== null &&
          quality.contentSketchCoverage !== undefined &&
          quality.contentSketchCoverage < 0.6) ||
        quality.tabbedContent?.complete === false ||
        (quality.wordRetentionRatio !== null &&
          quality.wordRetentionRatio < 0.4)
      )
    })
    .map((page) => page.htmlUrl)
}

export function markdownChecks(
  discovery: CrawlAgentDiscovery,
): AgentReadinessCheck[] {
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
  const sizedPages = markdown.pages.filter((page) => {
    const primary = page.explicit ?? page.negotiated
    return primary?.characters !== undefined
  })
  const largePages = sizedPages.filter((page) => {
    const primary = page.explicit ?? page.negotiated
    return (primary?.characters ?? 0) > 50_000
  })
  const veryLargePages = sizedPages.filter((page) => {
    const primary = page.explicit ?? page.negotiated
    return (primary?.characters ?? 0) > 100_000
  })
  const maxCharacters = Math.max(
    0,
    ...sizedPages.map(
      (page) => (page.explicit ?? page.negotiated)?.characters ?? 0,
    ),
  )
  const maxEstimatedTokens = Math.max(
    0,
    ...sizedPages.map(
      (page) => (page.explicit ?? page.negotiated)?.estimatedTokens ?? 0,
    ),
  )
  const parityPages = markdown.pages.filter(
    (page) =>
      page.quality?.contentSketchCoverage !== null &&
      page.quality?.contentSketchCoverage !== undefined,
  )
  const parityFailures = parityPages.filter(
    (page) => (page.quality?.contentSketchCoverage ?? 0) < 0.6,
  )
  const tabbedPages = markdown.pages.filter(
    (page) => (page.quality?.tabbedContent?.detectedPanels ?? 0) > 0,
  )
  const tabFailures = tabbedPages.filter(
    (page) => page.quality?.tabbedContent?.complete === false,
  )
  const tabUnknown = tabbedPages.filter(
    (page) => page.quality?.tabbedContent?.complete === null,
  )
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
            : 'info',
      title:
        tokenHeaders === markdown.evaluatedPages
          ? 'Every Markdown response includes a token estimate'
          : 'Some Markdown responses are missing a stable token estimate',
      plainEnglish: `${tokenHeaders} of ${markdown.evaluatedPages} evaluated pages returned X-Markdown-Tokens. Paired explicit and negotiated responses agreed where both existed. The value is an estimate, not an exact model-specific token count.`,
      action:
        tokenHeaders === markdown.evaluatedPages
          ? 'Keep the estimate stable when both explicit and negotiated responses exist.'
          : 'No change is required. X-Markdown-Tokens is optional; local size estimates are reported separately.',
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
      id: 'markdown-size',
      status:
        sizedPages.length === 0
          ? 'unknown'
          : largePages.length === 0
            ? 'pass'
            : 'warning',
      title:
        sizedPages.length === 0
          ? 'Markdown size was not measured'
          : largePages.length === 0
            ? 'Markdown representations stay within the review threshold'
            : 'Some Markdown representations are large enough to review',
      plainEnglish: `${sizedPages.length} Markdown responses were measured locally. ${largePages.length} exceeded 50,000 characters and ${veryLargePages.length} exceeded 100,000 characters. These are processing-risk thresholds, not universal model limits.`,
      action:
        largePages.length === 0
          ? 'Keep important content early and retain stable section structure as pages grow.'
          : 'Split genuinely separate topics, keep navigation and repeated chrome out of Markdown, and put the most useful content early. Do not remove necessary detail just to hit a threshold.',
      evidence: {
        measuredPages: sizedPages.length,
        reviewThresholdCharacters: 50_000,
        highRiskThresholdCharacters: 100_000,
        largePages: largePages.length,
        veryLargePages: veryLargePages.length,
        maxCharacters,
        maxEstimatedTokens,
        heuristic: true,
      },
      urls: largePages.map((page) => page.htmlUrl).slice(0, 25),
    }),
    check('representations', {
      id: 'markdown-content-parity',
      status:
        parityPages.length === 0
          ? 'unknown'
          : parityFailures.length === 0
            ? 'pass'
            : 'warning',
      title:
        parityPages.length === 0
          ? 'HTML and Markdown content parity was not measured'
          : parityFailures.length === 0
            ? 'Markdown retains sampled content from the HTML document'
            : 'Some Markdown responses may omit important HTML content',
      plainEnglish: `${parityPages.length} pages were compared using bounded hashes sampled across the main HTML content. ${parityFailures.length} retained less than 60% of that sample. This detects likely omissions without storing full page bodies.`,
      action:
        parityFailures.length === 0
          ? 'Keep the shared conversion path covered as templates and components change.'
          : 'Compare the affected HTML and Markdown around the missing sections, then fix the shared converter or component serialization.',
      evidence: {
        evaluatedPages: parityPages.length,
        failedPages: parityFailures.length,
        minimumCoverage: 0.6,
        sampling: 'bounded-content-shingles',
      },
      urls: parityFailures.map((page) => page.htmlUrl).slice(0, 25),
    }),
    check('representations', {
      id: 'markdown-tab-serialization',
      status:
        tabbedPages.length === 0
          ? 'notApplicable'
          : tabFailures.length > 0
            ? 'warning'
            : tabUnknown.length > 0
              ? 'unknown'
              : 'pass',
      title:
        tabbedPages.length === 0
          ? 'No accessible tabbed content was detected'
          : tabFailures.length > 0
            ? 'Some tab panels are missing from Markdown'
            : tabUnknown.length > 0
              ? 'Some tab panels were too small to compare reliably'
              : 'Markdown retains detected tab panels',
      plainEnglish:
        tabbedPages.length === 0
          ? 'The crawled HTML did not contain ARIA tablists with tab panels, so this check does not apply.'
          : `${tabbedPages.length} pages contained accessible tab panels. ${tabFailures.length} did not retain every evaluated panel in Markdown, and ${tabUnknown.length} had no panel large enough for a reliable comparison.`,
      action:
        tabFailures.length === 0
          ? tabUnknown.length > 0
            ? 'Review the affected page directly if the short tab labels or values are important to the document.'
            : 'Keep every panel serialized in document order even when only one tab is visible by default.'
          : 'Serialize all tab panels into the Markdown document with headings instead of exporting only the initially active panel.',
      evidence: {
        tabbedPages: tabbedPages.length,
        failedPages: tabFailures.length,
        unknownPages: tabUnknown.length,
      },
      urls: [...tabFailures, ...tabUnknown]
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
