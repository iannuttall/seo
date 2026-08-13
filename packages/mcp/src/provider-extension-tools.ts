import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  describeInstalledProviderExtension,
  listInstalledProviderExtensions,
  readProviderExtensionAccount,
  runProviderExtensionAction,
  type SeoProviderJson,
} from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from './agent-output-budget.js'
import { toolError, toolSuccess } from './tool-result.js'

const openOutputSchema = z.looseObject({})

export function registerProviderExtensionTools(server: McpServer): void {
  server.registerTool(
    'seo_list_providers',
    {
      description:
        'List provider packages installed through the seo CLI. Package installation requires human approval in a terminal.',
      inputSchema: {},
      outputSchema: openOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const result = await listInstalledProviderExtensions()
        return toolSuccess(
          `${result.installed.length} provider packages are installed.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_describe_provider',
    {
      description:
        'Describe one installed provider, its shared capabilities, and its agent action schemas',
      inputSchema: {
        id: z.string().trim().min(1).max(64),
      },
      outputSchema: openOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ id }) => {
      try {
        const result = await describeInstalledProviderExtension(id)
        return toolSuccess(`${result.id}: ${result.description}`, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_run_provider',
    {
      description:
        'Run one action from an installed provider after reading its schema with seo_describe_provider',
      inputSchema: {
        id: z.string().trim().min(1).max(64),
        action: z.string().trim().min(1).max(64),
        account: z.record(z.string(), z.string()).optional(),
        params: z.record(z.string(), z.unknown()).optional(),
        refresh: z.boolean().optional(),
      },
      outputSchema: openOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ id, action, account, params, refresh }) => {
      try {
        const result = await runProviderExtensionAction({
          providerId: id,
          actionId: action,
          account: account ?? readProviderExtensionAccount(id),
          params: (params ?? {}) as Record<string, SeoProviderJson>,
          refresh,
        })
        return toolSuccess(
          `Provider ${id} completed action ${action}.`,
          compactAgentWorkflowOutput(result),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
