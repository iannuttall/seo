import { SERP_PIXEL_BUDGETS, serpTextWidth } from '../serp/browser.js'
import { ALL, type Context, PROSE, type RuleInfo } from './engine.js'
import { quoted } from './rules-phrases.js'
import { sentenceAt, words } from './text.js'
import type { Block } from './types.js'

// Copy and SEO rules (dash punctuation, title and description length, one
// H1, weak link text) and the review lenses an agent or writer judges.

export const SEO_RULES: Record<string, RuleInfo> = {
  dash: {
    id: 'dash',
    family: 'copy',
    level: 'error',
    description:
      'Em dashes, en dashes and spaced hyphens used as dashes in copy. A separator in a title, such as "Pricing - Example", is left alone.',
  },
  titleLength: {
    id: 'title-length',
    family: 'seo',
    level: 'warning',
    presets: { meta: 'error' },
    description: 'A title tag shorter than 30 or longer than 60 characters.',
  },
  descriptionLength: {
    id: 'description-length',
    family: 'seo',
    level: 'warning',
    presets: { meta: 'error' },
    description:
      'A meta description shorter than 70 or longer than 160 characters.',
  },
  h1Count: {
    id: 'h1-count',
    family: 'seo',
    level: 'error',
    description: 'More than one H1 on the page.',
  },
  headingSkip: {
    id: 'heading-skip',
    family: 'seo',
    level: 'warning',
    description: 'A heading that skips a level, such as H2 straight to H4.',
  },
  headingCliche: {
    id: 'heading-cliche',
    family: 'copy',
    level: 'error',
    presets: { docs: 'warning' },
    description:
      'Headings that label instead of telling: "Overview", "Key takeaways", "Why it matters", "The ultimate guide".',
  },
  emoji: {
    id: 'emoji',
    family: 'copy',
    level: 'warning',
    description:
      'Emoji at the start of headings or list items, and decorative emoji such as 🎉 or 🚀 anywhere.',
  },
  exclamation: {
    id: 'exclamation',
    family: 'copy',
    level: 'warning',
    description:
      'Exclamation marks: any in landing copy and titles, two or more in a post.',
  },
  weakLink: {
    id: 'weak-link-text',
    family: 'copy',
    level: 'error',
    description:
      'Link or button text such as "click here", "here", "learn more" or "read more".',
  },
  unquantified: {
    id: 'unquantified-claim',
    family: 'copy',
    level: 'off',
    presets: { landing: 'warning', meta: 'warning' },
    description:
      'A comparative claim with no number: "significantly faster", "much better".',
  },
  heroLength: {
    id: 'hero-length',
    family: 'copy',
    level: 'off',
    presets: { landing: 'warning' },
    description: 'A landing page H1 longer than 12 words or 70 characters.',
  },
}

function dash(ctx: Context) {
  const rule = SEO_RULES.dash as RuleInfo
  const re =
    /\s*\u2014\s*|\s+--\s+|(\d)\u2013(?=\d)|\s*\u2013\s*|(?<=[\w)'"]) - (?=[\w('"])/g
  for (const block of ctx.blocks(ALL)) {
    re.lastIndex = 0
    for (const found of block.norm.matchAll(re)) {
      // "Pricing | Example" style separators in a title tag or label.
      if (
        (block.kind === 'title' || block.kind === 'label') &&
        /^\s+\S*\s+$/.test(found[0])
      ) {
        continue
      }
      const start = (found.index ?? 0) + (found[1] ? 1 : 0)
      const end = (found.index ?? 0) + found[0].length
      const range = Boolean(found[1])
      const kind = found[0].includes('\u2014')
        ? 'An em dash'
        : found[0].includes('\u2013')
          ? 'An en dash'
          : 'A hyphen used as a dash'
      const from = Math.max(0, start - 30)
      const to = Math.min(block.text.length, end + 30)
      ctx.hit(
        rule,
        block,
        from,
        to,
        range
          ? 'An en dash in a range.'
          : `${kind}. The house style uses no dash punctuation in copy.`,
        range
          ? 'Write "to", such as "2 to 3".'
          : 'Use a full stop, a comma or brackets, or rewrite the sentence.',
        range ? 'warning' : undefined,
      )
    }
  }
}

function lengths(ctx: Context) {
  for (const block of ctx.blocks(['title', 'description'])) {
    const title = block.kind === 'title'
    const rule = (
      title ? SEO_RULES.titleLength : SEO_RULES.descriptionLength
    ) as RuleInfo
    const [low, high] = title ? [30, 60] : [70, 160]
    const length = block.text.length
    if (length >= low && length <= high) continue
    const what = title ? 'title' : 'description'
    if (!length) {
      ctx.hit(
        rule,
        block,
        0,
        0,
        `The ${what} is empty.`,
        title
          ? 'Write a title that names the page, in 30 to 60 characters.'
          : 'Write one or two sentences that say what the page contains and who it is for, in 70 to 160 characters.',
        'error',
      )
      continue
    }
    // Google cuts by width, so the width (an estimate from Arial's letter
    // widths) shows beside the count.
    const pixels = Math.ceil(serpTextWidth(block.text, what))
    ctx.hit(
      rule,
      block,
      0,
      block.text.length,
      `The ${what} is ${length} characters, about ${pixels} pixels wide. Aim for ${low} to ${high} characters; Google shows about ${SERP_PIXEL_BUDGETS[what].desktop} pixels of a ${what} on desktop.`,
      length < low
        ? title
          ? 'Add the words people search for, or one true reason to click, such as "free" or "for any site".'
          : 'Say what the page contains and who it is for in one or two sentences.'
        : title
          ? 'Cut words after the main topic. Search results cut long titles off at about 60 characters.'
          : 'Cut it to one specific sentence. Search results cut descriptions off at about 160 characters.',
    )
  }
}

const HEADING_CLICHE =
  /^(?:a )?(?:deep dive|under the hood|demystifying\b|why (?:it|this|that) matters|a closer look|the ultimate guide|everything you need to know|mastering\b|unlocking\b|the power of\b|the future of\b|what you'll learn|key takeaways|final thoughts|wrapping up|conclusion|in conclusion|tl;?dr|overview|introduction|the road ahead|looking ahead|challenges and (?:legacy|opportunities|future)|future outlook|the bottom line|let's dive in|get started today|(?:the )?(?:challenge|solution|results?)$|at a glance$|first impressions$|a note of thanks$)/i

function headings(ctx: Context) {
  const list = ctx.blocks(['heading'])
  const h1s = list.filter((block) => block.level === 1)
  if (h1s.length > 1) {
    for (const block of h1s.slice(1)) {
      ctx.hit(
        SEO_RULES.h1Count as RuleInfo,
        block,
        0,
        block.text.length,
        `This page has ${h1s.length} H1 headings.`,
        'Keep one H1 that names the page and make the others H2.',
      )
    }
  }
  let previous = 0
  for (const block of list) {
    const level = block.level ?? 2
    if (previous && level > previous + 1) {
      ctx.hit(
        SEO_RULES.headingSkip as RuleInfo,
        block,
        0,
        block.text.length,
        `This H${level} follows an H${previous}.`,
        `Make it an H${previous + 1}, or add the missing level above it.`,
      )
    }
    previous = level
    if (HEADING_CLICHE.test(block.norm)) {
      ctx.hit(
        SEO_RULES.headingCliche as RuleInfo,
        block,
        0,
        block.text.length,
        'A heading that labels the section instead of saying what is in it.',
        'Name what the section tells the reader, such as "Check coverage before trusting the count".',
      )
    }
  }
}

const EMOJI = /^\p{Extended_Pictographic}/u
// Party and rocket emoji used as decoration anywhere in the text.
const DECORATION =
  /[\u{1F389}\u{1F680}\u{2728}\u{1F525}\u{1F4A1}\u{1F64C}\u{1F44F}\u{1F4AA}\u{1F3AF}\u{1F449}]/gu

function emoji(ctx: Context) {
  for (const block of ctx.blocks(ALL)) {
    if (block.kind === 'heading' || block.kind === 'list') {
      if (EMOJI.test(block.text)) continue
    }
    for (const found of block.text.matchAll(DECORATION)) {
      const at = found.index ?? 0
      ctx.hit(
        SEO_RULES.emoji as RuleInfo,
        block,
        at,
        at + found[0].length,
        `A decorative ${found[0]} emoji.`,
        'Remove it. The words should carry the point.',
      )
    }
  }
  for (const block of ctx.blocks(['heading', 'list'])) {
    if (EMOJI.test(block.text)) {
      ctx.hit(
        SEO_RULES.emoji as RuleInfo,
        block,
        0,
        Math.min(block.text.length, 40),
        `An emoji opens this ${block.kind === 'heading' ? 'heading' : 'list item'}.`,
        'Remove it. The words should carry the point.',
      )
    }
  }
}

function exclamation(ctx: Context) {
  const rule = SEO_RULES.exclamation as RuleInfo
  const short = ctx.preset === 'landing' || ctx.preset === 'meta'
  const marks: Array<{ block: Block; start: number }> = []
  for (const block of ctx.blocks(ALL)) {
    for (const found of block.norm.matchAll(/!+|\?!|!\?/g)) {
      marks.push({ block, start: found.index ?? 0 })
    }
  }
  const strong = marks.filter(({ block, start }) =>
    /!!|\?!|!\?/.test(block.norm.slice(start - 1, start + 2)),
  )
  const report = short || marks.length >= 2 ? marks : strong
  for (const { block, start } of report) {
    const sentence = sentenceAt(ctx.sentences(block), start)
    ctx.hit(
      rule,
      block,
      sentence.start,
      sentence.end,
      'An exclamation mark asks for excitement the sentence has not earned.',
      'Use a full stop and let the fact carry the weight.',
    )
  }
}

const WEAK_LINK =
  /^(?:click here|here|this link|this page|this post|link|read more|learn more|more|submit|click|go|continue|sign up|get started|find out more)$/i
const VAGUE_LINK =
  /^(?:click here|here|this link|this page|this post|link|click)$/i

function weakLinks(ctx: Context) {
  const rule = SEO_RULES.weakLink as RuleInfo
  for (const block of ctx.blocks(ALL)) {
    for (const link of block.links) {
      const text = block.text.slice(link.start, link.end).trim()
      if (!WEAK_LINK.test(text)) continue
      const vague = VAGUE_LINK.test(text)
      if (!vague && ctx.preset !== 'landing') continue
      ctx.hit(
        rule,
        block,
        link.start,
        link.end,
        `"${text}" does not say where the link goes or what happens next.`,
        'Use words that name the destination or the result, such as "the Google connection guide" or "Start a free crawl".',
        vague ? undefined : 'warning',
      )
    }
    for (const found of block.norm.matchAll(/\bclick here\b/gi)) {
      const at = found.index ?? 0
      if (quoted(block.norm, at, at + found[0].length)) continue
      if (block.links.some((link) => at >= link.start && at < link.end))
        continue
      ctx.hit(
        rule,
        block,
        found.index ?? 0,
        (found.index ?? 0) + found[0].length,
        '"Click here" does not say where the link goes.',
        'Link the words that name the destination.',
      )
    }
  }
}

function unquantified(ctx: Context) {
  const rule = SEO_RULES.unquantified as RuleInfo
  if (ctx.level(rule) === 'off') return
  const re =
    /\b(?:significantly|dramatically|substantially|massively|much|far|way|vastly)\s+(?:faster|better|easier|cheaper|lower|higher|more|less|smaller|quicker|simpler|safer)\b/gi
  for (const block of ctx.blocks(ALL)) {
    for (const found of block.norm.matchAll(re)) {
      const sentence = sentenceAt(ctx.sentences(block), found.index ?? 0)
      if (/\d|\bthan\b/.test(sentence.text)) continue
      ctx.hit(
        rule,
        block,
        found.index ?? 0,
        (found.index ?? 0) + found[0].length,
        `"${found[0]}" makes a claim with no number or comparison.`,
        'Give the number and what it is compared with, such as "about 3 times faster than a manual export".',
      )
    }
  }
}

function heroLength(ctx: Context) {
  const rule = SEO_RULES.heroLength as RuleInfo
  if (ctx.level(rule) === 'off') return
  for (const block of ctx.blocks(['heading'])) {
    if (block.level !== 1) continue
    const count = words(block.text).length
    if (count <= 12 && block.text.length <= 70) continue
    ctx.hit(
      rule,
      block,
      0,
      block.text.length,
      `The H1 is ${count} words. A headline that long is hard to take in at a glance.`,
      'Keep the main promise in the H1 and move the rest to the line below it.',
    )
  }
}

// Review lenses: lines a pattern can find but only a reader can judge.
const SUPERLATIVE =
  /\b(?:one of the (?:best|strongest|biggest|largest|fastest|leading|most \w+)|the (?:best|strongest|biggest|largest|fastest|most \w+) \w+(?: \w+)? (?:in|on|for|of)\b|best-known|world's (?:best|leading|first)|leading \w+ (?:in|for))/gi
const INANIMATE =
  /\b(?:page|pages|data|numbers?|market|table|chart|site|results page|fix|plan|report|crawl|template|search|traffic|links?|query|queries) (?:is |are )?(?:waiting for|tells? (?:us|you)|wants?|rewards?|punishes|knows?|deserves?|begs?|screams?|whispers?|craves?)\b/gi
const PROOF =
  /\b\d[\d,.]*\s*\+?\s*(?:happy |active |satisfied |paying |loyal )?(?:users|customers|teams|companies|businesses|subscribers|clients|marketers|brands)\b|\b\d+(?:\.\d+)?x (?:faster|more|better|cheaper)\b|\b\d{1,3}% (?:faster|more|less|fewer|higher|lower|increase|reduction|better|growth)\b/gi

function reviews(ctx: Context) {
  const prose = ctx.blocks(PROSE)
  for (const block of prose) {
    const sentences = ctx.sentences(block)
    SUPERLATIVE.lastIndex = 0
    for (const found of block.norm.matchAll(SUPERLATIVE)) {
      const index = sentences.indexOf(sentenceAt(sentences, found.index ?? 0))
      const nearby = sentences
        .slice(Math.max(0, index - 1), index + 2)
        .map((sentence) => sentence.text)
        .join(' ')
      if (/\d/.test(nearby)) continue
      ctx.review(
        'evidence',
        block,
        found.index ?? 0,
        (found.index ?? 0) + found[0].length,
        `What supports "${found[0]}"? Put the number or source next to it, or say it more plainly.`,
      )
    }
    INANIMATE.lastIndex = 0
    for (const found of block.norm.matchAll(INANIMATE)) {
      ctx.review(
        'metaphor',
        block,
        found.index ?? 0,
        (found.index ?? 0) + found[0].length,
        `"${found[0]}" gives a thing a person's wants or voice. Is that clearer than saying what happens?`,
      )
    }
    if (ctx.preset === 'landing' || ctx.preset === 'meta') {
      PROOF.lastIndex = 0
      for (const found of block.norm.matchAll(PROOF)) {
        ctx.review(
          'proof',
          block,
          found.index ?? 0,
          (found.index ?? 0) + found[0].length,
          `Is there a source for "${found[0]}" on the page? Link it or say where the number comes from.`,
        )
      }
    }
    // A short one-sentence paragraph that closes a section.
    if (
      block.kind === 'paragraph' &&
      block.endsSection &&
      sentences.length === 1 &&
      words(block.text).length <= 10 &&
      // A line such as "#1" or "4,210" is a label or a number, not a
      // closing line.
      words(block.text).filter((word) => /[a-z]/i.test(word)).length >= 3 &&
      /[.!?]["')]?$/.test(block.text)
    ) {
      ctx.review(
        'mic-drop',
        block,
        0,
        block.text.length,
        'Does this closing line add a fact? If it only restates the paragraph above, cut it.',
      )
    }
  }
  if (ctx.preset === 'landing' || ctx.preset === 'meta') {
    for (const block of ctx.blocks(['title', 'description', 'heading'])) {
      if (block.kind === 'heading' && block.level !== 1) continue
      if (!block.text) continue
      const later = words(block.text).slice(1)
      if (/\d/.test(block.text) || later.some((word) => /^[A-Z]/.test(word))) {
        continue
      }
      ctx.review(
        'swap-test',
        block,
        0,
        block.text.length,
        "Would this line work unchanged on a competitor's page? If so, add the product, number or result only you can claim.",
      )
    }
  }
}

export function runSeoRules(ctx: Context) {
  dash(ctx)
  lengths(ctx)
  headings(ctx)
  emoji(ctx)
  exclamation(ctx)
  weakLinks(ctx)
  unquantified(ctx)
  heroLength(ctx)
  reviews(ctx)
}
