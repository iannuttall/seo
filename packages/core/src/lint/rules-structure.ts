import type { Context, RuleInfo } from './engine.js'
import { BOLD_RULES, boldEmphasis, boldLabels } from './rules-bold.js'
import {
  CONTRAST_RULES,
  contrastReframe,
  negativeParallelism,
} from './rules-contrast.js'
import {
  COUNTED_RULES,
  colonDensity,
  countedPatterns,
  triads,
  vocabularyCluster,
} from './rules-counted.js'
import {
  anaphora,
  figurativeWorth,
  heresAnnouncement,
  pithyFragment,
  RHYTHM_RULES,
  staccato,
  stockCloser,
} from './rules-rhythm.js'

// Sentence-shape rules: contrasts, fragments, closers, rhythm, counted
// patterns and bold. Some thresholds come from eric-tramel/slop-guard and
// conorbronsdon/avoid-ai-writing (both MIT); counts are relative to the
// document.

// Order matters: when two AI-pattern rules match the same words, the
// earlier one is reported.
export const STRUCTURE_RULES: Record<string, RuleInfo> = {
  negativeParallelism: CONTRAST_RULES.negativeParallelism as RuleInfo,
  contrastReframe: CONTRAST_RULES.contrastReframe as RuleInfo,
  heresAnnouncement: RHYTHM_RULES.heresAnnouncement as RuleInfo,
  pithyFragment: RHYTHM_RULES.pithyFragment as RuleInfo,
  stockCloser: RHYTHM_RULES.stockCloser as RuleInfo,
  negativeReframe: RHYTHM_RULES.negativeReframe as RuleInfo,
  figurativeWorth: RHYTHM_RULES.figurativeWorth as RuleInfo,
  anaphora: RHYTHM_RULES.anaphora as RuleInfo,
  vocabularyCluster: COUNTED_RULES.vocabularyCluster as RuleInfo,
  triad: COUNTED_RULES.triad as RuleInfo,
  inventedLabel: COUNTED_RULES.inventedLabel as RuleInfo,
  colonDensity: COUNTED_RULES.colonDensity as RuleInfo,
  pseudoCleft: COUNTED_RULES.pseudoCleft as RuleInfo,
  boldEmphasis: BOLD_RULES.boldEmphasis as RuleInfo,
  boldLabels: BOLD_RULES.boldLabels as RuleInfo,
}

export function runStructureRules(ctx: Context) {
  negativeParallelism(ctx)
  contrastReframe(ctx)
  heresAnnouncement(ctx)
  pithyFragment(ctx)
  stockCloser(ctx)
  figurativeWorth(ctx)
  staccato(ctx)
  anaphora(ctx)
  vocabularyCluster(ctx)
  triads(ctx)
  countedPatterns(ctx)
  colonDensity(ctx)
  boldLabels(ctx)
  boldEmphasis(ctx)
}
