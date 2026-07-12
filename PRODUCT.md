# Product

## Name

The product name has three registers. As a wordmark or visual brand it is
SEO, in caps, the way the acronym is properly written. As the command,
package, and in any code context it is `seo`, lowercase. When prose truly
has to name the product, it is SEO Skill: one skill is the product story,
and the CLI and MCP server are the machinery behind it. Never use the bare
lowercase word as a name in prose; it reads as a typo.

The stronger rule is that prose almost never needs the name. Copy is
benefit-first and written to the reader: say what they get and what to do,
not what the product is. "Give your agent owner-verified Search Console and
GA4 data" beats "The seo CLI gives your agent...". Self-description
sentences ("X is a local SEO engine...") are cut, not rewritten.

The positioning is one SEO skill backed by a powerful CLI and MCP server.
The CLI does the heavy lifting, so an agent carries one short skill instead
of fifty, its context window stays clean, and it fetches the detail for each
tool at the moment it runs it. Say this in full, direct sentences.

The tagline is "The SEO command for AI agents". The site brand in the nav
is SEO Skill, the home is seoskill.dev, and speak of the skill in the
singular everywhere: the plural "skills" survives only in ecosystem names
such as the `skills/` directory convention, `npx skills add`, and
agent-skills spec paths.

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
