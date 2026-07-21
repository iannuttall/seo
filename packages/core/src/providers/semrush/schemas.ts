import { z } from 'zod'

const optionalFiniteNumber = z.number().finite().optional()

export const semrushKeywordOverviewSchema = z
  .object({
    phrase: z.string().trim().min(1),
    volume: optionalFiniteNumber,
    cpc: optionalFiniteNumber,
    competition: optionalFiniteNumber,
    difficulty: optionalFiniteNumber,
    intent: z.string().trim().min(1).optional(),
    results: optionalFiniteNumber,
  })
  .strict()

export const semrushKeywordRowSchema = z
  .object({
    phrase: z.string().trim().min(1),
    volume: optionalFiniteNumber,
    difficulty: optionalFiniteNumber,
    cpc: optionalFiniteNumber,
    competition: optionalFiniteNumber,
    url: z.string().trim().min(1).optional(),
    domain: z.string().trim().min(1).optional(),
    position: optionalFiniteNumber,
  })
  .strict()

export const semrushKeywordRowsSchema = z.array(semrushKeywordRowSchema)

export const semrushDifficultyRowsSchema = z.array(
  z
    .object({
      phrase: z.string().trim().min(1),
      kd: z.number().finite(),
    })
    .strict(),
)
