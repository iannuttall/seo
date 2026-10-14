import { z } from 'zod'

// One tool shape for MCP. Each tool parses its input with Zod and returns
// the text an agent reads.

export type ToolContext = {
  env: Env
  // The caller's Google access token.
  google: string
  // The request headers, which carry optional provider keys.
  headers: Headers
  // Work that may finish after the response, such as usage counts.
  waitUntil: (promise: Promise<unknown>) => void
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

// Every tool takes the same optional dates. Without them it uses the latest
// final Search Console days (28, or 90 for traffic-drop).
export const DateWindow = {
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('YYYY-MM-DD. Optional; send with end_date.'),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('YYYY-MM-DD. Optional; send with start_date.'),
}

// Rows shown per page when detail is "rows".
export const PAGE_SIZE = 50

export const Detail = {
  detail: z
    .enum(['summary', 'rows', 'full'])
    .default('summary')
    .describe(
      'summary first. rows: the next page of rows. full: every field as JSON.',
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('rows only: the first row to return.'),
}
