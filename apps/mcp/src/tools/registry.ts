import type { LinkedAccounts } from '@seo/core/commands'
import type { z } from 'zod'

// One tool shape for MCP. Each tool parses its input with Zod and returns
// the text an agent reads.

export type ToolContext = {
  env: Env
  // The signed-in person's id.
  userId: string
  // The person's linked Google and Bing accounts.
  directory: LinkedAccounts
  // The request headers plus stored research keys; headers win.
  headers: Headers
  // Work that may finish after the response, such as usage counts.
  waitUntil: (promise: Promise<unknown>) => void
}

// Errors share one class with the core commands, so both are reported the
// same way.
import {
  type CommandErrorCode,
  CommandError as ToolError,
} from '@seo/core/commands'

export { ToolError }
export type ErrorCode = CommandErrorCode

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
