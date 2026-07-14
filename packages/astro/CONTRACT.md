# Agent Markdown contract

This package turns final, owned Astro HTML into deterministic Markdown. It is
not a general web-content extractor.

## Converter decision

The build uses Linkedom with Turndown 7.2.4 and the GFM plugin 1.0.2. The
versions are direct dependencies and are pinned in the workspace lockfile.

Defuddle remains the SEO crawler's fallback for unknown third-party pages. It
is not used for owned build output because its heuristic extraction can drop
site-specific headings, tabs and component content. Its full Markdown helper
also expects browser globals when imported in Node. The direct converter won
the fixture comparison because the site supplies a stable content root and can
mark decorative components for removal.

Supported output includes ATX headings, paragraphs, emphasis, links, images,
ordered and unordered lists, inline code, fenced code with language labels,
GFM tables, task lists and strikethrough. Disclosure and tab content is kept as
normal headings and prose. Browser-only interaction and visual component
chrome are deliberately lost.

## Fixed policy decisions

- Frontmatter keys are `title`, `description`, `canonical`, then `language`.
- Values are JSON-quoted YAML scalars.
- The token estimate is `ceil(UTF-8 bytes / 4)` and is exposed as
  `X-Markdown-Tokens`.
- Indexable HTML and Markdown representations share one canonical URL.
- A Markdown representation of an existing noindex page remains noindex at the
  HTTP layer.
- Content Signals are `search=yes, ai-input=yes, ai-train=no`.
- The software is **SEO Skill** at `https://seoskill.dev`.
- The creator and publisher is **Ian Nuttall** at `https://ian.is`.
- Official product identities are the canonical GitHub repository and npm
  package. Other links are not treated as identity evidence.

## Determinism

Conversion has no network access, model call, time, randomness or checkout-path
input. It uses LF line endings, removes trailing whitespace and ends with one
newline. The same HTML, page URL and options must always return identical bytes.
