import { z } from 'zod'

// One tool shape for MCP. Each tool parses its input with Zod and returns
// the text an agent reads.

export type ToolContext = {
  env: Env
  // The caller's Google access token.
  google: string
  // The request headers, which carry optional provider keys.
  headers: Headers
}

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_CONNECTED'
  | 'NO_ACCESS'
  | 'NO_KEY'
  | 'RATE_LIMITED'
  | 'GOOGLE_ERROR'
  | 'PROVIDER_ERROR'

export class ToolError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export type Tool = {
  name: string
  title: string
  description: string
  input: z.ZodObject
  run(context: ToolContext, input: unknown): Promise<string>
}

export function defineTool<S extends z.ZodObject>(spec: {
  name: string
  title: string
  description: string
  input: S
  run(context: ToolContext, input: z.output<S>): Promise<string>
}): Tool {
  return {
    ...spec,
    async run(context, input) {
      const parsed = spec.input.safeParse(input ?? {})
      if (!parsed.success) {
        throw new ToolError(
          'INVALID_INPUT',
          parsed.error.issues
            .map(
              (issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`,
            )
            .join('; '),
        )
      }
      return spec.run(context, parsed.data)
    },
  }
}

export const Site = z
  .string()
  .min(1)
  .describe(
    'Search Console property or site, such as sc-domain:example.com, https://example.com/ or example.com.',
  )

export const DateWindow = {
  days: z
    .number()
    .int()
    .min(1)
    .max(480)
    .optional()
    .describe('Days of final data ending on the latest final day.'),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('YYYY-MM-DD. Use with end_date instead of days.'),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('YYYY-MM-DD. Use with start_date.'),
}

export const Detail = {
  detail: z
    .enum(['summary', 'rows', 'full'])
    .default('summary')
    .describe(
      'summary: headline, key facts, top rows and limits. rows: a page of rows. full: every field as JSON. Start with summary.',
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('rows only: first row to return.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(50)
    .describe('rows: rows to return. Reports: most items to keep.'),
}
