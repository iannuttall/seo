import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DecisionAnswer } from '../decision-model.js'
import { decideWithModel, decideWithoutModel } from './internal-links-judge.js'
import type { PairPlacement } from './internal-links-placement.js'

// A source page on composting and a target page on worm bins. S2 names the
// target well; S5 barely does. A3 comes from S5, the others from S2.
const placement: PairPlacement = {
  sentences: [
    {
      id: 'S2',
      text: 'Worm bins are a good option for small gardens and balconies where a full heap would not fit.',
      section: 'Choosing a bin',
      match: 0.42,
    },
    {
      id: 'S5',
      text: 'A balanced compost heap needs roughly equal amounts of green and brown material.',
      section: 'How a heap works',
      match: 0.08,
    },
  ],
  anchors: [
    { text: 'worm bins', sentence: 'S2' },
    { text: 'small gardens', sentence: 'S2' },
    { text: 'compost heap', sentence: 'S5' },
  ],
}

function choice(
  picked: string,
  probabilities: Record<string, number>,
): DecisionAnswer {
  return {
    type: 'choice',
    choice: picked,
    confidence: probabilities[picked] ?? 0,
    probabilities,
  }
}

// Answers shaped as Jev returns them for target index 0.
function answers(input: {
  link: number
  where: string
  anchor: string
  anchorProbabilities?: Record<string, number>
  role: string
}): Record<string, DecisionAnswer> {
  return {
    link_0: { type: 'noul', noul: input.link },
    where_0: choice(input.where, {
      S2: input.where === 'S2' ? 0.81 : 0.1,
      S5: input.where === 'S5' ? 0.7 : 0.05,
      none: input.where === 'none' ? 0.88 : 0.05,
    }),
    anchor_0: choice(
      input.anchor,
      input.anchorProbabilities ?? { [input.anchor]: 0.9 },
    ),
    role_0: choice(input.role, { [input.role]: 0.74, weak_or_none: 0.06 }),
  }
}

test('a yes is possible from 0.5 and strong from 0.75, and below 0.5 is declined', () => {
  const at = (link: number) =>
    decideWithModel(
      placement,
      0.3,
      answers({ link, where: 'S2', anchor: 'A1', role: 'deeper_detail' }),
      0,
    )
  assert.deepEqual(at(0.499), {
    state: 'declined',
    reason: 'below-threshold',
    probability: 0.499,
  })
  const possible = at(0.5)
  assert.equal(possible.state, 'suggest')
  assert.equal(possible.state === 'suggest' && possible.tier, 'possible')
  const stillPossible = at(0.749)
  assert.equal(
    stillPossible.state === 'suggest' && stillPossible.tier,
    'possible',
  )
  const strong = at(0.75)
  assert.deepEqual(strong, {
    state: 'suggest',
    tier: 'strong',
    probability: 0.75,
    role: 'deeper_detail',
    sentence: {
      text: placement.sentences[0]?.text,
      section: 'Choosing a bin',
      match: 0.42,
    },
    anchor: 'worm bins',
  })
})

test('a confident yes with no reason for the reader is declined', () => {
  const decision = decideWithModel(
    placement,
    0.3,
    answers({ link: 0.93, where: 'S2', anchor: 'A1', role: 'weak_or_none' }),
    0,
  )
  assert.deepEqual(decision, {
    state: 'declined',
    reason: 'weak-role',
    probability: 0.93,
  })
})

test('an anchor from another sentence is replaced by the likeliest one from the chosen sentence', () => {
  const decision = decideWithModel(
    placement,
    0.3,
    answers({
      link: 0.82,
      where: 'S2',
      // Jev prefers A3, which is in S5, then A2, then A1.
      anchor: 'A3',
      anchorProbabilities: { A3: 0.6, A2: 0.3, A1: 0.1, none: 0 },
      role: 'deeper_detail',
    }),
    0,
  )
  assert.equal(decision.state, 'suggest')
  assert.equal(decision.state === 'suggest' && decision.anchor, 'small gardens')
})

test('an anchor of none leaves the link text empty', () => {
  const decision = decideWithModel(
    placement,
    0.3,
    answers({ link: 0.8, where: 'S2', anchor: 'none', role: 'next_step' }),
    0,
  )
  assert.equal(decision.state === 'suggest' && decision.anchor, null)
})

test('the evidence floors overrule a strong yes', () => {
  const weakSentence = decideWithModel(
    placement,
    0.3,
    answers({ link: 0.9, where: 'S5', anchor: 'A3', role: 'explains_concept' }),
    0,
  )
  assert.deepEqual(weakSentence, {
    state: 'held-back',
    reason: 'weak-sentence',
    detail:
      'the sentence has 8% of the words that name the page; a link needs 10%',
    probability: 0.9,
  })

  const noSentence = (similarity: number) =>
    decideWithModel(
      placement,
      similarity,
      answers({
        link: 0.9,
        where: 'none',
        anchor: 'A1',
        role: 'broader_guide',
      }),
      0,
    )
  const held = noSentence(0.149)
  assert.equal(held.state === 'held-back' && held.reason, 'no-sentence')
  // Similar enough pages keep the link, with no sentence and no anchor.
  assert.deepEqual(noSentence(0.15), {
    state: 'suggest',
    tier: 'strong',
    probability: 0.9,
    role: 'broader_guide',
    sentence: null,
    anchor: null,
  })
})

test('without a model the same floors apply to the best sentence', () => {
  assert.equal(decideWithoutModel(placement, 0.3).state, 'suggest')
  const weakFirst: PairPlacement = {
    sentences: [placement.sentences[1] as PairPlacement['sentences'][number]],
    anchors: [{ text: 'compost heap', sentence: 'S5' }],
  }
  const held = decideWithoutModel(weakFirst, 0.3)
  assert.equal(held.state === 'held-back' && held.reason, 'weak-sentence')
})
