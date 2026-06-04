export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export function summarize(data: unknown): string {
  return JSON.stringify(data, null, 2)
}

export function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
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
