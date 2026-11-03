import type { CheerioAPI } from 'cheerio'

// The parts of a parsed HTML node the text walker reads.
type HtmlNode = {
  type: string
  data?: string
  name?: string
  children?: HtmlNode[]
}

export type SiteCheckGroup = 'pages' | 'copy' | 'design' | 'data'
export type SiteCheckLevel = 'fail' | 'warn'

export type SiteCheckRule = {
  group: SiteCheckGroup
  level: SiteCheckLevel
  // What to do, in plain words. The issue adds the page and what was found.
  fix: string
}

// Crawler rules that apply to a static build, and how strict the site check
// is about each. Rules about the live server (HTTPS, compression, response
// time, redirects) are left to `seo crawl` after launch.
export const CRAWLER_RULES: Record<string, SiteCheckRule> = {
  missing_title: page('fail', 'Give the page a title.'),
  title_duplicate: page('fail', 'Give every page its own title.'),
  title_too_wide: page('warn', 'Put the important words first in the title.'),
  missing_meta_description: page('fail', 'Give the page a meta description.'),
  meta_description_duplicate: page(
    'fail',
    'Give every page its own meta description.',
  ),
  canonical_missing: page('fail', 'Add a canonical link to the page URL.'),
  canonical_invalid: page('fail', 'Fix the canonical URL.'),
  canonical_conflict: page('fail', 'Keep one canonical link per page.'),
  canonical_multiple: page('fail', 'Keep one canonical link per page.'),
  canonical_outside_head: page('fail', 'Move the canonical link into <head>.'),
  canonical_non_absolute: page('fail', 'Use an absolute canonical URL.'),
  canonical_mismatch: page(
    'fail',
    'Point the canonical at the URL the page is served from.',
  ),
  canonicalized_page: page(
    'fail',
    'Build only the canonical version of a page.',
  ),
  noindex: page(
    'fail',
    'Remove noindex. Improve a thin page, merge it with a 301, or do not build it.',
  ),
  x_robots_noindex: page('fail', 'Remove the noindex header.'),
  nofollow: page('fail', 'Remove nofollow from the robots meta tag.'),
  client_rendered_content: page(
    'fail',
    'Put the page content in the built HTML, not only in JavaScript.',
  ),
  near_empty_content: page(
    'warn',
    'Add real content from the data, or do not build the page.',
  ),
  duplicate_content: page(
    'fail',
    'Merge pages with the same content, or make each one useful on its own.',
  ),
  orphan_page: page('fail', 'Link to the page from a hub or a related page.'),
  deep_page: page('warn', 'Link to the page from a page nearer the home page.'),
  large_html: page('warn', 'Make the page smaller.'),
  image_missing_alt: page('fail', 'Give every image alt text.'),
  viewport_missing: page('fail', 'Add the viewport meta tag.'),
  lang_missing: page('fail', 'Set the lang attribute on <html>.'),
  hreflang_invalid: page('fail', 'Fix the hreflang links.'),
  hreflang_duplicate: page('fail', 'Keep one hreflang link per language.'),
  hreflang_incomplete: page('fail', 'Make hreflang links point both ways.'),
  structured_data_missing: page('fail', 'Add the page JSON-LD graph.'),
  jsonld_invalid: page('fail', 'Fix the JSON-LD so it parses.'),
  rich_result_required_fields_missing: page(
    'fail',
    'Add the required fields to the structured data.',
  ),
  og_title_missing: page('fail', 'Add og:title.'),
  og_description_missing: page('fail', 'Add og:description.'),
  og_image_missing: page('fail', 'Add og:image.'),
  twitter_card_missing: page('fail', 'Add the twitter:card tag.'),
}

export const SITE_RULES: Record<string, SiteCheckRule> = {
  one_h1: page('fail', 'Give the page exactly one H1.'),
  title_length: page('fail', 'Keep the title between 10 and 65 characters.'),
  description_length: page(
    'fail',
    'Keep the meta description between 50 and 170 characters.',
  ),
  heading_order: page('warn', 'Do not skip heading levels.'),
  broken_link: page('fail', 'Point the link at a page or file in the build.'),
  not_found_page_missing: page('fail', 'Add a 404 page (src/pages/404.astro).'),
  sitemap_missing: page('fail', 'Build sitemap.xml.'),
  sitemap_page_missing: page('fail', 'List every indexable page in a sitemap.'),
  sitemap_extra_url: page(
    'fail',
    'List only built, indexable pages in the sitemaps.',
  ),
  sitemap_file_too_large: page(
    'fail',
    'Split sitemap files at 5,000 URLs under one sitemap index.',
  ),
  robots_missing: page('fail', 'Add robots.txt.'),
  robots_blocks_site: page('fail', 'Do not disallow the whole site.'),
  robots_sitemap_missing: page('fail', 'List the sitemap in robots.txt.'),
  robots_content_signal_missing: page(
    'warn',
    'Add a Content-Signal line to robots.txt.',
  ),
  og_image_file_missing: page(
    'fail',
    'Draw the sharing image for the page at build time.',
  ),
  og_image_size: page('warn', 'Draw sharing images at 1200 by 630.'),
  markdown_copy_missing: page(
    'fail',
    'Build a Markdown copy of the page and link it as an alternate.',
  ),
  llms_txt_missing: page('fail', 'Build llms.txt.'),
  llms_txt_broken_link: page('fail', 'Point llms.txt links at built files.'),
  faq_schema_mismatch: page(
    'fail',
    'Mark up only the questions and answers the page shows, word for word.',
  ),
  copy_dash: copy('Use a full stop, comma or brackets instead of a dash.'),
  copy_semicolon: copy('Split the sentence instead of using a semicolon.'),
  copy_contrast: copy('Say what the thing is. Drop the "not X but Y" line.'),
  copy_puffery: copy('Use a plain word, or cut the claim.'),
  copy_throat_clearing: copy('Start with the answer.'),
  copy_process_words: copy(
    'Keep the build, the tools and search terms out of page copy.',
  ),
  copy_coming_soon: copy('Publish it when it exists, or leave it out.'),
  design_uppercase: design('Use sentence case.'),
  design_letter_spacing: design('Remove the letter spacing.'),
  design_gradient: design('Use a flat colour.'),
  design_shadow: design('Separate things with spacing or a hairline.'),
  design_left_border: design('Remove the coloured left border.'),
  design_wide_grid: design('Use one or two columns, or a table.'),
  design_raw_colour: design(
    'Use a theme class such as bg-muted, text-foreground or text-primary. Colours live in src/styles/globals.css.',
  ),
  design_style_block: design(
    'Use Tailwind classes, or add the style to src/styles/globals.css.',
  ),
  data_source_missing: data('Link each fact block to its source.'),
  data_checked_missing: data('Show the date each fact block was last checked.'),
  data_checked_invalid: data('Use a real, past date for the checked date.'),
}

function page(level: SiteCheckLevel, fix: string): SiteCheckRule {
  return { group: 'pages', level, fix }
}
function copy(fix: string): SiteCheckRule {
  return { group: 'copy', level: 'fail', fix }
}
function design(fix: string): SiteCheckRule {
  return { group: 'design', level: 'fail', fix }
}
function data(fix: string): SiteCheckRule {
  return { group: 'data', level: 'fail', fix }
}

export function ruleFor(rule: string): SiteCheckRule {
  const found = SITE_RULES[rule] ?? CRAWLER_RULES[rule]
  if (!found) throw new Error(`Missing site check rule ${rule}`)
  return found
}

const words = (list: string[]) =>
  new RegExp(`\\b(?:${list.join('|')})\\b`, 'gi')

// Copy rules from CONTENT.md and the writing rules every site follows.
const COPY_PATTERNS: Array<[rule: string, pattern: RegExp]> = [
  ['copy_dash', /[\u2013\u2014]/g],
  ['copy_semicolon', /;/g],
  [
    'copy_contrast',
    /\b(?:it(?:'|\u2019)?s|it is|this is|that(?:'|\u2019)?s) not (?:just |only |about )?[^.,!?]{1,40}, it(?:'|\u2019)?s\b|\bnot (?:just|only) [^.,!?]{1,40} but\b|\bless about [^.,!?]{1,40} (?:and )?more about\b/gi,
  ],
  [
    'copy_puffery',
    words([
      'revolutionary',
      'revolutioni[sz]e',
      'seamless(?:ly)?',
      'robust',
      'ultimate',
      'game[- ]chang(?:er|ing)',
      'cutting[- ]edge',
      'state[- ]of[- ]the[- ]art',
      'world[- ]class',
      'best[- ]in[- ]class',
      'unparalleled',
      'unlock(?:s|ing)?',
      'unleash(?:es|ing)?',
      'leverag(?:e|es|ing)',
      'supercharg(?:e|es|ing)',
      'effortless(?:ly)?',
      'holistic',
      'delve',
      'next[- ]level',
      'one[- ]stop shop',
      'look no further',
    ]),
  ],
  [
    'copy_throat_clearing',
    words([
      'in this (?:guide|article|post)',
      "let(?:'|\u2019)?s dive in",
      'dive into',
      'did you know',
      'have you ever wondered',
      'it is (?:important|worth) (?:to note|noting)',
      "it(?:'|\u2019)?s worth noting",
      'the truth is',
      'the honest answer',
      "in today(?:'|\u2019)?s",
      'at the time of writing',
      'as of writing',
      'without the hype',
    ]),
  ],
  [
    'copy_process_words',
    words([
      'astro',
      'cloudflare',
      'wrangler',
      'scrap(?:e|ed|er|ers|ing)',
      'llms?',
      'ai[- ]generated',
      'placeholder',
      'lorem ipsum',
      'todo',
      'tbd',
      'deploy(?:s|ed|ing|ment)?',
      'pull request',
      'search volume',
      'keywords?',
      'programmatic seo',
    ]),
  ],
  [
    'copy_coming_soon',
    words([
      'coming soon',
      'under construction',
      'work in progress',
      'stay tuned',
      'not yet available',
    ]),
  ],
]

export function copyViolations(
  text: string,
  allowWords: readonly string[],
): Array<{ rule: string; found: string[] }> {
  let checked = text.normalize('NFKC')
  for (const allowed of allowWords) {
    if (allowed) checked = checked.split(allowed).join(' ')
  }
  const out: Array<{ rule: string; found: string[] }> = []
  for (const [rule, pattern] of COPY_PATTERNS) {
    const found = [
      ...new Set([...checked.matchAll(pattern)].map((m) => m[0])),
    ].slice(0, 5)
    if (found.length) out.push({ rule, found })
  }
  return out
}

// Design rules read the built CSS: inline styles, <style> blocks and files.
const DESIGN_PATTERNS: Array<[rule: string, pattern: RegExp]> = [
  [
    'design_uppercase',
    /text-transform\s*:\s*uppercase|font-variant(?:-caps)?\s*:\s*(?:all-)?small-caps/gi,
  ],
  [
    'design_letter_spacing',
    /letter-spacing\s*:\s*\+?(?:0?\.\d*[1-9]|[1-9][\d.]*)/gi,
  ],
  ['design_gradient', /(?:repeating-)?(?:linear|radial|conic)-gradient\(/gi],
  [
    'design_shadow',
    /(?:box|text)-shadow\s*:\s*(?!none\b|0\s*0\s*(?:0\s*)?(?:#0000|transparent)|initial\b|unset\b|var\(--tw-inset-shadow\))[^;}]+|--tw-shadow\s*:\s*(?!0\s+0\s+#0000)[^;}]+|drop-shadow\(/gi,
  ],
  [
    'design_left_border',
    /border-(?:left|inline-start)(?:-width)?\s*:\s*[^;}]*?(?:\b(?:[2-9]|\d{2,})(?:\.\d+)?px|\b(?:0?\.[2-9]|[1-9])[\d.]*(?:r?em)|\b(?:medium|thick)\b)/gi,
  ],
  [
    'design_wide_grid',
    /grid-template-columns\s*:\s*(?:repeat\(\s*(?:[3-9]|\d{2,}|auto-fill|auto-fit)\b|(?:[^;}]*?\b\d*\.?\d+fr\b){3})/gi,
  ],
]

export function designViolations(
  css: string,
): Array<{ rule: string; found: string[] }> {
  const checked = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Array<{ rule: string; found: string[] }> = []
  for (const [rule, pattern] of DESIGN_PATTERNS) {
    const found = [
      ...new Set([...checked.matchAll(pattern)].map((m) => m[0].trim())),
    ].slice(0, 3)
    if (found.length) out.push({ rule, found })
  }
  return out
}

const TAILWIND_PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

// Theme rules read the source of pages, components and layouts, so every
// colour and style comes from the one theme file.
const THEME_PATTERNS: Array<[rule: string, pattern: RegExp]> = [
  [
    'design_raw_colour',
    new RegExp(
      [
        // #fff, #ffffff and #ffffff80 after a colon, a space, a bracket or a
        // quote, so a link to #main is not a colour.
        String.raw`(?<=[\s:(\[,'"])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![\w-])`,
        String.raw`\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\(`,
        // Tailwind's fixed palette and its black and white.
        String.raw`(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|accent|caret|divide|shadow|placeholder)-(?:(?:${TAILWIND_PALETTE})-\d{2,3}|black|white)(?:\/\d+)?(?![\w-])`,
      ].join('|'),
      'gi',
    ),
  ],
  ['design_style_block', /<style\b[^>]*>/gi],
]

export function themeViolations(
  source: string,
): Array<{ rule: string; found: string[] }> {
  // Comments may name colours, and the href of a link is never a colour.
  const checked = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\bhref=(["'])[^"']*\1/gi, '')
  const out: Array<{ rule: string; found: string[] }> = []
  for (const [rule, pattern] of THEME_PATTERNS) {
    const found = [
      ...new Set([...checked.matchAll(pattern)].map((m) => m[0].trim())),
    ].slice(0, 3)
    if (found.length) out.push({ rule, found })
  }
  return out
}

const BLOCK_TAGS = new Set(
  'address article aside blockquote caption dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol option p section summary table tbody td tfoot th thead tr ul'.split(
    ' ',
  ),
)
const SKIPPED_TAGS = new Set(
  'script style template noscript code pre kbd samp svg math'.split(' '),
)

// The words a reader sees, one entry per block, so inline tags never split a
// word and adjacent blocks never join into one sentence.
export function visibleTextBlocks($: CheerioAPI): string[] {
  const blocks: string[] = []
  let buffer = ''
  const flush = () => {
    const text = buffer.replace(/\s+/g, ' ').trim()
    if (text) blocks.push(text)
    buffer = ''
  }
  const visit = (node: HtmlNode) => {
    if (node.type === 'text') {
      buffer += node.data ?? ''
      return
    }
    if (!node.name || SKIPPED_TAGS.has(node.name)) return
    if (node.name === 'br') {
      buffer += ' '
      return
    }
    const block = BLOCK_TAGS.has(node.name)
    if (block) flush()
    for (const child of node.children ?? []) visit(child)
    if (block) flush()
  }
  for (const node of $('body').toArray() as unknown as HtmlNode[]) visit(node)
  flush()
  return blocks
}

// Other text people read: the title, descriptions, labels and alt text.
export function metadataText($: CheerioAPI): string[] {
  const out: string[] = [$('title').first().text()]
  $('meta').each((_i, element) => {
    const key = (
      $(element).attr('name') ??
      $(element).attr('property') ??
      ''
    ).toLowerCase()
    if (
      /^(?:description|og:title|og:description|og:image:alt|twitter:title|twitter:description)$/.test(
        key,
      )
    ) {
      out.push($(element).attr('content') ?? '')
    }
  })
  $('[alt], [aria-label], [title], [placeholder]').each((_i, element) => {
    if ($(element).closest('head, script, style, template, svg').length) return
    for (const attribute of ['alt', 'aria-label', 'title', 'placeholder']) {
      const value = $(element).attr(attribute)
      if (value) out.push(value)
    }
  })
  return out.map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean)
}
