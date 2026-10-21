import type {
  DecisionAnswer,
  DecisionQuestion,
  DecisionRequest,
} from '../decision-model.js'
import type { PairPlacement } from './internal-links-placement.js'

// The questions a decision model answers for internal links, and the rules
// in code that turn its answers into suggestions. The model only classifies
// pages and picks among real pages, sentences and phrases; it writes no text.
// Fixed evidence floors here can overrule it. Pure code: runs anywhere.

export const PAGE_TYPES = {
  pillar_guide:
    'A long, broad guide that covers a whole topic and would naturally link out to many narrower pages',
  support_article:
    'A focused article, post, tutorial, or explainer about one narrower subject',
  product_or_service:
    'Sells or describes a product, service, plan, pricing, demo, or signup: a page that makes money',
  comparison_or_review:
    'Compares options, reviews one, or lists the best of something to help a reader choose',
  glossary_or_definition:
    "A short page that defines one term or answers one 'what is' question",
  tool_or_calculator:
    'An interactive tool, calculator, generator, or checker the reader uses on the page',
  news_or_update:
    'A dated announcement, release note, changelog entry, or news item that will go stale',
  category_hub:
    'A listing, archive, tag, category, or index page that mostly lists other pages',
  home: "The site's home page",
  about_or_company:
    'About, team, contact, press, careers, or other company information',
  legal_or_utility:
    'Privacy, terms, cookies, login, search, 404, thank-you, or other utility pages readers do not seek out',
  other: null,
} as const

export type PageType = keyof typeof PAGE_TYPES

export const SEARCH_INTENTS = {
  informational: 'The reader wants to learn or understand something',
  commercial: 'The reader is comparing or evaluating options before buying',
  transactional:
    'The reader wants to buy, sign up, download, or complete an action now',
  navigational: 'The reader wants to reach a specific page or part of the site',
} as const

export type SearchIntent = keyof typeof SEARCH_INTENTS

export const LINK_ROLES = {
  explains_concept: 'The target explains a term or idea the source mentions',
  deeper_detail:
    'The target goes deeper into a sub-topic the source only touches on',
  broader_guide:
    'The target is the broader guide or hub the source belongs under',
  next_step: 'The target is what a reader should read or do after this part',
  product_or_service:
    'The target is the product or service that solves the problem discussed',
  comparison_or_alternative:
    'The target compares or offers an alternative to what the source discusses',
  weak_or_none: 'No clear reason a reader would want the target here',
} as const

export type LinkRole = keyof typeof LINK_ROLES

// A yes needs at least POSSIBLE; STRONG or more is a strong yes.
export const THRESHOLDS = { possible: 0.5, strong: 0.75 } as const
// Evidence floors that overrule a yes: a chosen sentence must hold this
// share of the words that name the target, and a link with no sentence needs
// pages at least this similar.
export const FLOORS = {
  minSentenceMatch: 0.1,
  minSimilarityAlone: 0.15,
} as const
// Suggestions kept per target page.
export const MAX_PER_TARGET = 8
// Pages per classify request (two questions each) and targets per judge
// request (four questions each): ten questions or fewer per request.
export const PAGES_PER_CLASSIFY = 5
export const TARGETS_PER_JUDGE = 2

// How much a page is worth linking to: none for pages readers do not need
// more links to, less for news that goes stale.
export function targetWeight(type: PageType | null): number {
  if (
    type === 'home' ||
    type === 'legal_or_utility' ||
    type === 'about_or_company' ||
    type === 'category_hub'
  ) {
    return 0
  }
  return type === 'news_or_update' ? 0.6 : 1
}

// Pages whose body is not a place for a contextual link.
export function canBeSource(type: PageType | null): boolean {
  return (
    type !== 'home' && type !== 'category_hub' && type !== 'legal_or_utility'
  )
}

export interface ClassifyPage {
  url: string
  title: string
  description: string
  h1: string
  headings: string[]
  excerpt: string
  words: number
}

export function classifyRequest(pages: ClassifyPage[]): DecisionRequest {
  const questions: Record<string, DecisionQuestion> = {}
  pages.forEach((_, index) => {
    questions[`type_${index}`] = {
      type: 'choice',
      instructions: `What kind of page is \`pages[${index}]\`?`,
      criteria: PAGE_TYPES,
    }
    questions[`intent_${index}`] = {
      type: 'choice',
      instructions: `What does a visitor arriving at \`pages[${index}]\` from a search engine most likely want?`,
      criteria: SEARCH_INTENTS,
    }
  })
  return {
    state: {
      pages: pages.map((page) => ({
        url: page.url,
        title: page.title,
        description: page.description,
        h1: page.h1,
        headings: page.headings,
        excerpt: page.excerpt,
        word_count: page.words,
      })),
    },
    questions,
  }
}

function choiceOf(answer: DecisionAnswer | undefined): string | null {
  return answer?.type === 'choice' ? answer.choice : null
}

export function readClassification(
  answers: Record<string, DecisionAnswer>,
  index: number,
): { type: PageType | null; intent: SearchIntent | null } {
  const type = choiceOf(answers[`type_${index}`])
  const intent = choiceOf(answers[`intent_${index}`])
  return {
    type: type && Object.hasOwn(PAGE_TYPES, type) ? (type as PageType) : null,
    intent:
      intent && Object.hasOwn(SEARCH_INTENTS, intent)
        ? (intent as SearchIntent)
        : null,
  }
}

export interface JudgeSource {
  url: string
  title: string
  type: PageType | null
}

export interface JudgeTarget {
  url: string
  title: string
  description: string
  h1: string
  type: PageType | null
  intent: SearchIntent | null
  // The opening of the page, at most 300 characters.
  opening: string
  placement: PairPlacement
}

// One source with up to two targets: four questions per target.
export function judgeRequest(
  source: JudgeSource,
  targets: JudgeTarget[],
): DecisionRequest {
  const sentences = new Map<
    string,
    { id: string; under_heading: string; text: string }
  >()
  for (const target of targets) {
    for (const sentence of target.placement.sentences) {
      sentences.set(sentence.id, {
        id: sentence.id,
        under_heading: sentence.section,
        text: sentence.text,
      })
    }
  }
  const questions: Record<string, DecisionQuestion> = {}
  targets.forEach((target, index) => {
    const ref = `\`targets[${index}]\``
    questions[`link_${index}`] = {
      type: 'noul',
      instructions: `Should the page \`source\` add a link from within its body text to the page ${ref}?`,
      criteria: {
        true: 'A reader of the source would gain something by reading the target here; the two pages cover related subjects and the link would feel natural and helpful',
        false:
          'The pages are only loosely related, the target adds nothing for this reader, or the link would feel forced or spammy',
      },
    }
    questions[`where_${index}`] = {
      type: 'choice',
      instructions: `Which sentence in \`source.sentences\` is the most natural place to add a link to ${ref}? Choose "none" if no listed sentence leads a reader towards that page.`,
      criteria: {
        ...Object.fromEntries(
          target.placement.sentences.map((sentence) => [
            sentence.id,
            sentence.text,
          ]),
        ),
        none: 'No listed sentence is a natural place for this link',
      },
    }
    if (target.placement.anchors.length) {
      questions[`anchor_${index}`] = {
        type: 'choice',
        instructions: `Which phrase should become the clickable link text for a link from \`source\` to ${ref}? Prefer a phrase that tells the reader what the target page is about and reads naturally as a link.`,
        criteria: {
          ...Object.fromEntries(
            target.placement.anchors.map((anchor, at) => [
              `A${at + 1}`,
              { text: anchor.text, in_sentence: anchor.sentence },
            ]),
          ),
          none: 'None of these phrases would make a good link',
        },
      }
    }
    questions[`role_${index}`] = {
      type: 'choice',
      instructions: `If \`source\` linked to ${ref}, what would the link do for the reader?`,
      criteria: LINK_ROLES,
    }
  })
  return {
    state: {
      source: {
        url: source.url,
        title: source.title,
        page_type: source.type ?? 'unknown',
        sentences: [...sentences.values()].sort(
          (left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)),
        ),
      },
      targets: targets.map((target) => ({
        url: target.url,
        title: target.title,
        description: target.description,
        h1: target.h1,
        page_type: target.type ?? 'unknown',
        search_intent: target.intent ?? 'unknown',
        opening: target.opening,
      })),
    },
    questions,
  }
}

export type HeldBackReason = 'weak-sentence' | 'no-sentence'
export type DeclinedReason = 'below-threshold' | 'weak-role' | 'no-answer'

export type LinkDecision =
  | {
      state: 'suggest'
      tier: 'strong' | 'possible' | 'heuristic'
      // The model's probability that the link helps; null without a model.
      probability: number | null
      role: LinkRole | null
      sentence: { text: string; section: string; match: number } | null
      anchor: string | null
    }
  | {
      state: 'held-back'
      reason: HeldBackReason
      detail: string
      probability: number | null
    }
  | { state: 'declined'; reason: DeclinedReason; probability: number | null }

// The floors every suggestion must pass, with or without a model.
function floor(
  sentence: { match: number } | null,
  similarity: number,
  probability: number | null,
): LinkDecision | null {
  if (sentence && sentence.match < FLOORS.minSentenceMatch) {
    return {
      state: 'held-back',
      reason: 'weak-sentence',
      detail: `the sentence has ${Math.round(sentence.match * 100)}% of the words that name the page; a link needs ${Math.round(FLOORS.minSentenceMatch * 100)}%`,
      probability,
    }
  }
  if (!sentence && similarity < FLOORS.minSimilarityAlone) {
    return {
      state: 'held-back',
      reason: 'no-sentence',
      detail: `no sentence to place it in, and the pages are ${similarity.toFixed(2)} similar; a link without a sentence needs ${FLOORS.minSimilarityAlone}`,
      probability,
    }
  }
  return null
}

// A model's four answers for one pair, read with the thresholds, the floors
// and the rule that the anchor must sit in the chosen sentence.
export function decideWithModel(
  placement: PairPlacement,
  similarity: number,
  answers: Record<string, DecisionAnswer>,
  index: number,
): LinkDecision {
  const link = answers[`link_${index}`]
  const role = choiceOf(answers[`role_${index}`])
  if (link?.type !== 'noul' || !role) {
    return { state: 'declined', reason: 'no-answer', probability: null }
  }
  const probability = Math.round(link.noul * 1000) / 1000
  if (probability < THRESHOLDS.possible) {
    return { state: 'declined', reason: 'below-threshold', probability }
  }
  if (role === 'weak_or_none' || !Object.hasOwn(LINK_ROLES, role)) {
    return { state: 'declined', reason: 'weak-role', probability }
  }
  const where = choiceOf(answers[`where_${index}`])
  const sentence =
    placement.sentences.find((option) => option.id === where) ?? null
  const held = floor(sentence, similarity, probability)
  if (held) return held
  let anchor: string | null = null
  const picked = answers[`anchor_${index}`]
  if (sentence && picked?.type === 'choice' && picked.choice !== 'none') {
    const inSentence = placement.anchors
      .map((option, at) => ({ ...option, key: `A${at + 1}` }))
      .filter((option) => option.sentence === sentence.id)
    // A phrase from another sentence cannot be the link text here; the most
    // likely phrase from the chosen sentence takes its place.
    const chosen =
      inSentence.find((option) => option.key === picked.choice) ??
      [...inSentence].sort(
        (left, right) =>
          (picked.probabilities[right.key] ?? 0) -
            (picked.probabilities[left.key] ?? 0) ||
          left.key.localeCompare(right.key),
      )[0]
    anchor = chosen?.text ?? null
  }
  return {
    state: 'suggest',
    tier: probability >= THRESHOLDS.strong ? 'strong' : 'possible',
    probability,
    role: role as LinkRole,
    sentence: sentence
      ? {
          text: sentence.text,
          section: sentence.section,
          match: sentence.match,
        }
      : null,
    anchor,
  }
}

// Without a model: the sentence that best names the target and the best
// phrase from it, under the same floors. A heuristic, labelled as one.
export function decideWithoutModel(
  placement: PairPlacement,
  similarity: number,
): LinkDecision {
  const sentence = placement.sentences[0] ?? null
  const held = floor(sentence, similarity, null)
  if (held) return held
  return {
    state: 'suggest',
    tier: 'heuristic',
    probability: null,
    role: null,
    sentence: sentence
      ? {
          text: sentence.text,
          section: sentence.section,
          match: sentence.match,
        }
      : null,
    anchor:
      placement.anchors.find((option) => option.sentence === sentence?.id)
        ?.text ?? null,
  }
}
