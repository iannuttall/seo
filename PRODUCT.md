# Product

## Name

The product name has three registers. As a wordmark or visual brand it is
SEO, in caps, the way the acronym is properly written. As the command,
package, and in any code context it is `seo`, lowercase. In running prose,
never use the bare word as a name, because uppercase collides with the
practice and lowercase reads as a typo; qualify it instead: the `seo`
command, the seo CLI, the seo package.

The tagline is "The SEO command for AI agents". The definition sentence,
used wherever a first-time reader needs one, is:

> The `seo` command is a local SEO engine for AI agents. Install it once and
> your agents can crawl a site, read your Search Console and GA4 data, and
> run evidence-backed reports.

The project was formerly named SEO Skills CLI. That name survives only as a
JSON-LD alternate name and one former-name mention in the trademark policy.

## Users

Three users, all first class:

- People who run their own sites. They want a calm guided path: install, sign
  in, get one main report that says what is wrong, what to fix first, and how
  to check the fix worked. They should never need to learn report ids.
- AI agents. They reach the same engine through the MCP server, the CLI in
  JSON mode, and one router skill. They discover reports at runtime, fetch
  per-report guidance when they need it, and get structured evidence they can
  act on. Agents are the primary growth path.
- Developers who embed the report engine in scripts, CI, or TypeScript apps
  through the library export.

Both human and agent paths run the same core report logic and return the same
evidence. Keep the human path calm. Keep the agent path powerful.

## Product purpose

A local-first SEO engine. It exists so that anyone, or any agent, can audit a
site and act on real evidence without a hosted platform, an account, or a
subscription. Reports, tokens, and caches stay on the user's machine. Success
is a report that is technically defensible, an agent that picks the right
report without help, and a user who trusts the output enough to act on it.

## Vocabulary

- "Audit" is the activity. Human-facing copy leads with audit language: run
  an SEO audit, a technical SEO audit, audit evidence.
- "Report" is the artifact. The API surface keeps it: `seo reports list`,
  `describe`, `run`, and the report ids never bend to marketing vocabulary.
  Half the catalog is analysis, measurement, or monitoring rather than
  auditing, and agents parse words literally.

## Brand personality

Honest, direct, evidence-first. The voice explains plainly, admits what the
data cannot show, and never sells hard. Being trustworthy where the category
is hyped is the positioning, not a constraint on it. Three words: honest,
direct, useful.

## Anti-references

Things this product must never look or read like:

- SEO-tool marketing that promises rankings, traffic, or "guaranteed
  results", or that invents scores without showing the method behind them.
- Dashboard-first SaaS framing: signup walls, urgency banners, plans and
  seats, "book a demo".
- Generated-sounding prose: em dashes as rhythm, "it's not X, it's Y"
  pivots, "unlock", "leverage", "seamless", keyword-stuffed headings.
- Fear-based upsells that turn observations into emergencies. A `noindex`
  is an observation until intent says otherwise.

## Report truth

Every surface inherits the same rules: observed evidence stays separate from
derived findings, partial or capped data is never presented as a zero or an
all-clear, heuristics are labeled as heuristics, and every recommendation
ships with a way to verify the fix. These rules are the brand as much as the
name is. The full contract lives in AGENTS.md.

## Design

The visual identity is deliberately minimal until launch settles. A full
redesign follows, built around the S logo mark (two interlocking hooks with
rank-delta triangles) and a skills.sh-style treatment: wordmark, small
all-caps tagline, one definition sentence. When that happens, a DESIGN.md
with machine-readable tokens joins this file. Until then: sentence-case
headings, restrained color, no decoration that copy could do better.
