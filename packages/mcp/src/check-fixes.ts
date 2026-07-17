export type CheckFixResource = {
  title: string
  url: string
}

export type CheckFix = {
  goal: string
  fix: string
  prompt: string
  resources: readonly CheckFixResource[]
  verify: string
}

const AGENT_READINESS_FIXES: Readonly<Record<string, CheckFix>> = {
  'crawler-access': {
    goal: 'Keep robots.txt policy for AI crawler tokens intentional.',
    fix: 'Review the blocked tokens in the check evidence. Remove accidental Disallow rules for crawlers you want, and keep deliberate blocks documented so nobody reverts them by mistake.',
    prompt:
      'Open robots.txt and list every rule that affects the AI crawler tokens named in the agent-readiness crawler-access evidence. For each blocked token, decide with the site owner whether the block is intentional. Remove only the accidental rules, redeploy, then re-run the agent-readiness report and confirm the crawler-access check lists no unintended blocks.',
    resources: [
      {
        title: 'RFC 9309: Robots Exclusion Protocol',
        url: 'https://www.rfc-editor.org/rfc/rfc9309',
      },
    ],
    verify:
      'Re-run the report and confirm the blocked list contains only intentional tokens. An allowed token still does not prove the service crawls the site.',
  },
  'protocol-canonicalization': {
    goal: 'Serve one canonical HTTPS origin with a permanent redirect and HSTS.',
    fix: 'Redirect the HTTP variant to HTTPS with a 301 or 308, redirect the alternate www or bare host to the preferred host, and send Strict-Transport-Security once HTTPS is stable everywhere.',
    prompt:
      'Configure the web server or CDN so http:// requests return one permanent redirect to the https:// start URL, and the non-preferred host redirects to the preferred host. Add a Strict-Transport-Security header on HTTPS responses. Then re-run the agent-readiness report and confirm protocol-canonicalization passes.',
    resources: [
      {
        title: 'MDN: Strict-Transport-Security',
        url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security',
      },
    ],
    verify:
      'curl -I the HTTP and alternate-host variants and confirm one permanent redirect each, then re-run the report.',
  },
  'markdown-coverage': {
    goal: 'Give every public HTML page a Markdown representation.',
    fix: 'Serve text/markdown through content negotiation or advertise one working Markdown alternative per page with a link rel="alternate" type="text/markdown" tag, generated from the same content source as the HTML.',
    prompt:
      'For each URL listed in the markdown-coverage check, make the route return Markdown when requested with Accept: text/markdown, or publish a .md alternate advertised from the HTML head. Generate the Markdown from the same source as the HTML so the two cannot drift. Re-run the agent-readiness report and confirm markdown-coverage passes.',
    resources: [
      {
        title: 'Markdown for Agents',
        url: 'https://developers.cloudflare.com/agents/markdown-for-agents/',
      },
    ],
    verify:
      'Request each affected URL with Accept: text/markdown and confirm a 200 text/markdown response.',
  },
  'markdown-negotiation': {
    goal: 'Make Markdown content negotiation honest and cache-safe.',
    fix: 'Honour Accept q-values, send Vary: Accept on negotiated responses, and keep the explicit .md file and the negotiated response byte-identical.',
    prompt:
      'Fix the routes listed in the markdown-negotiation check so that Accept: text/markdown returns Markdown, an Accept header that refuses Markdown returns HTML, every negotiated response carries Vary: Accept, and the explicit alternate matches the negotiated body byte for byte. Re-run the agent-readiness report and confirm markdown-negotiation passes.',
    resources: [
      {
        title: 'RFC 9110: Content negotiation',
        url: 'https://www.rfc-editor.org/rfc/rfc9110#name-content-negotiation',
      },
    ],
    verify:
      'Request one affected URL twice, once with Accept: text/markdown and once with text/markdown;q=0, and confirm the content types differ while Vary: Accept is present.',
  },
  'markdown-determinism': {
    goal: 'Return identical Markdown bytes for repeated requests.',
    fix: 'Remove timestamps, request ids, random ordering, or per-request rewriting from the Markdown pipeline so the same route always produces the same bytes.',
    prompt:
      'Fetch one affected URL from the markdown-determinism check twice and diff the responses. Remove whatever changes between requests, usually timestamps or randomised output, from the generator. Re-run the agent-readiness report and confirm markdown-determinism passes.',
    resources: [],
    verify:
      'Fetch the same Markdown URL twice and confirm the SHA-256 digests match.',
  },
  'markdown-token-estimates': {
    goal: 'Publish a stable token estimate on Markdown responses.',
    fix: 'Add an X-Markdown-Tokens header with a deterministic estimate, and keep the value identical between the explicit and negotiated responses for the same document.',
    prompt:
      'Add an X-Markdown-Tokens response header to the Markdown routes listed in the markdown-token-estimates check, computed deterministically from the response body. Re-run the agent-readiness report and confirm the check passes.',
    resources: [],
    verify:
      'Request an affected URL and confirm the header is present and unchanged on a second request.',
  },
  'markdown-quality': {
    goal: 'Keep Markdown alternatives clean, structured, and complete.',
    fix: 'Fix the shared HTML to Markdown converter rather than individual files. Keep one H1 and the frontmatter title, exclude layout components, and stop SVG, script, and style markup leaking into the output.',
    prompt:
      'Open the Markdown for each URL in the markdown-quality check and identify the defects the evidence names, such as leaked markup, duplicate prose, or navigation-only output. Fix the converter or component exclusion rules that cause them, then re-run the agent-readiness report and confirm markdown-quality passes.',
    resources: [],
    verify:
      'Read one regenerated Markdown file end to end and confirm the useful copy survived without presentation markup.',
  },
  'agent-skills': {
    goal: 'Publish a valid, digest-verified Agent Skills index.',
    fix: 'Serve /.well-known/agent-skills/index.json with a $schema field and a skills array. Each skill needs a same-origin Markdown SKILL.md with name and description frontmatter, and a sha256 digest generated from the exact deployed bytes.',
    prompt:
      'Publish or repair the Agent Skills discovery index at /.well-known/agent-skills/index.json. Regenerate every declared digest from the deployed SKILL.md bytes, keep skill URLs same-origin, serve them as text/markdown with an Access-Control-Allow-Origin header, and confirm each file has name and description frontmatter. Re-run the agent-readiness report and confirm agent-skills passes.',
    resources: [
      {
        title: 'Agent Skills discovery specification',
        url: 'https://agentskills.io/specification',
      },
    ],
    verify:
      'Fetch the index and one skill file, recompute the SHA-256 digest, and confirm it matches the declared value.',
  },
  'llms-txt': {
    goal: 'Keep llms.txt short, stable, and pointing at pages that resolve.',
    fix: 'Curate the file to useful entry points. Remove duplicate, redirected, broken, and non-indexable links, keep it under the size cap, and generate it deterministically so repeated fetches return identical bytes.',
    prompt:
      'Fix the llms.txt issues listed in the check evidence: remove or repair every malformed, duplicate, redirected, broken, or non-indexable link, and make the file deterministic. The generate-llms-txt report can rebuild it from the crawl. Re-run the agent-readiness report and confirm llms-txt passes. Do not present llms.txt as a Google ranking factor.',
    resources: [
      { title: 'llms.txt proposal', url: 'https://llmstxt.org/' },
      {
        title: 'Google guidance on llms.txt',
        url: 'https://developers.google.com/search/updates#clarifying-guidance-on-llms-txt-files',
      },
    ],
    verify:
      'Fetch llms.txt twice and confirm identical bytes, then spot-check that each listed link returns 200 without redirecting.',
  },
  'llms-full-txt': {
    goal: 'Publish llms-full.txt only when a consumer wants the expanded file.',
    fix: 'Generate /llms-full.txt from the same source as llms.txt, serve it as text/plain or text/markdown, and keep it deterministic. Skip it entirely if nothing consumes it.',
    prompt:
      'If an intended consumer needs the expanded companion file, generate /llms-full.txt deterministically from the same content source as llms.txt and serve it with a text content type. Re-run the agent-readiness report and confirm the llms-full-txt check reflects the published file.',
    resources: [{ title: 'llms.txt proposal', url: 'https://llmstxt.org/' }],
    verify:
      'Fetch /llms-full.txt and confirm a 200 with a text content type and stable bytes across two requests.',
  },
  'content-signals': {
    goal: 'Declare one deliberate Content Signals policy.',
    fix: 'Add a Content-Signal directive to robots.txt stating the search, ai-input, and ai-train preferences the site owner actually wants. If response headers also carry the policy, keep every surface identical.',
    prompt:
      'Agree the content usage policy with the site owner, then add one Content-Signal line to robots.txt, for example Content-Signal: search=yes, ai-input=yes, ai-train=no. If HTML or Markdown responses also send a content-signal header, make the values match robots.txt exactly. Re-run the agent-readiness report and confirm content-signals passes.',
    resources: [
      { title: 'Content Signals policy', url: 'https://contentsignals.org/' },
    ],
    verify:
      'Fetch robots.txt and one page and confirm every observed Content-Signal value is identical.',
  },
  'route-manifest': {
    goal: 'Publish a deterministic route manifest when HTML and Markdown parity matters.',
    fix: 'Generate /agent-routes.json from the build with a pages array of htmlPath and markdownPath entries, so a crawl can prove no orphan or missing Markdown routes were deployed.',
    prompt:
      'Generate /agent-routes.json at build time listing every public HTML route and its Markdown alternate. Fix any routes the route-manifest evidence lists as missing or orphaned, then re-run the agent-readiness report and confirm route-manifest passes.',
    resources: [],
    verify:
      'Compare the manifest against the deployed routes and confirm no missing or orphan entries remain.',
  },
  'link-headers': {
    goal: 'Advertise machine-readable resources with Link response headers.',
    fix: 'Add Link headers to the start page pointing at resources that exist. Use registered relation types such as api-catalog, service-desc, service-doc, or describedby, and emerging types such as llms-txt or agent-skills only when the target resolves.',
    prompt:
      'Add Link response headers to the homepage that point at real machine-readable resources, for example Link: </.well-known/api-catalog>; rel="api-catalog" or Link: </llms.txt>; rel="llms-txt"; type="text/markdown". Confirm every advertised target returns 200, then re-run the agent-readiness report and confirm link-headers passes.',
    resources: [
      {
        title: 'RFC 8288: Web Linking',
        url: 'https://www.rfc-editor.org/rfc/rfc8288',
      },
      {
        title: 'IANA link relation registry',
        url: 'https://www.iana.org/assignments/link-relations/link-relations.xhtml',
      },
    ],
    verify:
      'curl -I the homepage and confirm the Link header lists the intended relation types and each target resolves.',
  },
  'mcp-server-card': {
    goal: 'Describe a real public MCP endpoint with a server card.',
    fix: 'Serve /.well-known/mcp/server-card.json with serverInfo (name and version), the transport endpoint, and capabilities. Publish it only when the MCP endpoint actually exists.',
    prompt:
      'If this site exposes a public MCP endpoint, publish /.well-known/mcp/server-card.json as JSON with serverInfo, the transport endpoint, and capabilities that match the deployed server. The format is a draft MCP proposal, so note that in any claims. Re-run the agent-readiness report and confirm mcp-server-card reflects the published card.',
    resources: [
      {
        title: 'MCP server card proposal (SEP-1649)',
        url: 'https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127',
      },
    ],
    verify:
      'Fetch the card, confirm it parses as JSON with serverInfo, and confirm the declared endpoint accepts an MCP connection.',
  },
  'a2a-agent-card': {
    goal: 'Describe a real agent-to-agent endpoint with an agent card.',
    fix: 'Serve /.well-known/agent-card.json with the agent name, url, and capabilities from the A2A specification. Publish it only when the site hosts an A2A endpoint.',
    prompt:
      'If this site hosts an agent-to-agent endpoint, publish /.well-known/agent-card.json as JSON with at least name, url, and capabilities matching the deployed endpoint. Re-run the agent-readiness report and confirm a2a-agent-card reflects the published card.',
    resources: [
      {
        title: 'A2A protocol specification',
        url: 'https://a2a-protocol.org/latest/specification/',
      },
    ],
    verify:
      'Fetch the card, confirm it parses as JSON with a name, and confirm the declared endpoint responds.',
  },
  'oauth-discovery': {
    goal: 'Let clients discover the authorization server for protected APIs.',
    fix: 'Publish /.well-known/openid-configuration for OpenID Connect or /.well-known/oauth-authorization-server for plain OAuth 2.0, including issuer, authorization_endpoint, token_endpoint, and jwks_uri.',
    prompt:
      'If this origin has OAuth-protected APIs, publish authorization server metadata at /.well-known/oauth-authorization-server or /.well-known/openid-configuration with the issuer and endpoint URLs of the real authorization server. Re-run the agent-readiness report and confirm oauth-discovery reflects the published metadata.',
    resources: [
      {
        title: 'RFC 8414: OAuth 2.0 Authorization Server Metadata',
        url: 'https://www.rfc-editor.org/rfc/rfc8414',
      },
      {
        title: 'OpenID Connect Discovery',
        url: 'https://openid.net/specs/openid-connect-discovery-1_0.html',
      },
    ],
    verify:
      'Fetch the metadata, confirm the issuer matches the origin, and complete one token flow against the declared endpoints.',
  },
  'oauth-protected-resource': {
    goal: 'Tell clients how to obtain tokens for protected resources.',
    fix: 'Publish /.well-known/oauth-protected-resource with the resource identifier, the authorization_servers list, and scopes_supported per RFC 9728.',
    prompt:
      'If this origin serves OAuth-protected APIs, publish /.well-known/oauth-protected-resource as JSON with resource, authorization_servers, and scopes_supported values that match the real deployment. Re-run the agent-readiness report and confirm oauth-protected-resource reflects the published metadata.',
    resources: [
      {
        title: 'RFC 9728: OAuth 2.0 Protected Resource Metadata',
        url: 'https://www.rfc-editor.org/rfc/rfc9728',
      },
    ],
    verify:
      'Fetch the metadata and confirm each listed authorization server issues tokens the resource accepts.',
  },
  'api-catalog': {
    goal: 'Make published APIs discoverable through an API catalog.',
    fix: 'Serve /.well-known/api-catalog as application/linkset+json with a linkset array. Each entry needs an anchor URL plus service-desc and service-doc links for the API.',
    prompt:
      'If this site publishes APIs, create /.well-known/api-catalog returning application/linkset+json with one linkset entry per API, each carrying an anchor and service-desc or service-doc links that resolve. Re-run the agent-readiness report and confirm api-catalog reflects the published catalog.',
    resources: [
      {
        title: 'RFC 9727: api-catalog well-known URI',
        url: 'https://www.rfc-editor.org/rfc/rfc9727',
      },
      {
        title: 'RFC 9264: Linkset',
        url: 'https://www.rfc-editor.org/rfc/rfc9264',
      },
    ],
    verify:
      'Fetch the catalog, confirm the linkset parses, and confirm each linked description resolves.',
  },
  'web-bot-auth': {
    goal: 'Publish signing keys when this operator signs its own bot requests.',
    fix: 'Serve /.well-known/http-message-signatures-directory with the JSON Web Key Set used to sign outbound bot requests, per the Web Bot Auth draft.',
    prompt:
      'If this operator runs bots that sign requests with Web Bot Auth, publish the signing keys as a JWKS at /.well-known/http-message-signatures-directory. Re-run the agent-readiness report and confirm web-bot-auth reflects the published directory.',
    resources: [
      {
        title: 'Web Bot Auth draft',
        url: 'https://datatracker.ietf.org/doc/draft-meunier-web-bot-auth-architecture/',
      },
    ],
    verify:
      'Fetch the directory, confirm the keys array parses, and confirm a signed request validates against a published key.',
  },
  'auth-md': {
    goal: 'Explain agent registration when agents can really sign up.',
    fix: 'Serve /auth.md as Markdown describing how an agent registers and authenticates, and pair it with real OAuth discovery metadata at the well-known paths.',
    prompt:
      'If agents can register for and authenticate with this site, publish /auth.md as a Markdown guide covering registration, credential types, and token endpoints, consistent with the OAuth metadata the site publishes. Re-run the agent-readiness report and confirm auth-md reflects the published file.',
    resources: [
      { title: 'auth.md proposal', url: 'https://github.com/workos/auth.md' },
    ],
    verify:
      'Fetch /auth.md, confirm a text or Markdown content type, and follow the documented registration steps once.',
  },
  'identity-graph': {
    goal: 'Connect truthful WebSite, creator, and page-level structured data.',
    fix: 'Add JSON-LD that links the WebSite node, a Person or Organization creator, and page-level types. Use sameAs only for official profiles, and add SoftwareApplication only when the site represents software.',
    prompt:
      'Add or repair the JSON-LD identity graph: one WebSite node, a truthful Person or Organization creator or publisher, and appropriate page-level types, all linked by id references. Use sameAs only for official profiles of the same entity. Re-run the agent-readiness report and confirm identity-graph passes.',
    resources: [
      {
        title: 'Schema.org WebSite',
        url: 'https://schema.org/WebSite',
      },
    ],
    verify:
      'Validate the JSON-LD parses and confirm each claimed profile link belongs to the same entity.',
  },
}

const CHECK_FIXES: Readonly<
  Record<string, Readonly<Record<string, CheckFix>>>
> = {
  'agent-readiness': AGENT_READINESS_FIXES,
}

export function listFixableChecks(reportId: string): string[] {
  return Object.keys(CHECK_FIXES[reportId] ?? {}).sort()
}

export function getCheckFix(
  reportId: string,
  checkId: string,
): CheckFix | undefined {
  return CHECK_FIXES[reportId]?.[checkId]
}
