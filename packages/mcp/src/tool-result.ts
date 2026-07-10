import { seoErrorEnvelope } from '@seo/core'

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export function summarize(data: unknown): string {
  return JSON.stringify(data, null, 2)
}

export function toolError(error: unknown): ToolResult {
  const envelope = seoErrorEnvelope(error)
  return {
    content: [{ type: 'text', text: `Error: ${envelope.error.message}` }],
    structuredContent: envelope,
    isError: true,
  }
}

export function toolSuccess(
  summaryText: string,
  structuredContent: unknown,
  options: { markdown?: string } = {},
): ToolResult {
  return {
    content: [{ type: 'text', text: options.markdown ?? summaryText }],
    structuredContent: structuredContent as Record<string, unknown>,
  }
}
