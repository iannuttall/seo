import assert from 'node:assert/strict'
import test from 'node:test'
import { registerOpportunityTools } from './opportunity-tools.js'

type ToolResult = {
  structuredContent?: Record<string, unknown>
}

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>

test('opportunity handlers forward bounded CTR and cluster controls', async () => {
  const handlers = new Map<string, ToolHandler>()
  let ctrInput: unknown
  let clusterInput: unknown

  registerOpportunityTools(
    {
      registerTool(name: string, _config: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
      },
    } as never,
    {
      ctrUnderperformersReport: async (input) => {
        ctrInput = input
        return { summary: { verdict: 'CTR fixture.' } } as never
      },
      queryClusterReport: async (input) => {
        clusterInput = input
        return { summary: { verdict: 'Cluster fixture.' } } as never
      },
    },
  )

  const ctrParams = {
    site: 'sc-domain:example.com',
    minImpressions: 250,
    limit: 12,
    brandTerms: ['Example'],
    includeBrand: true,
    refresh: true,
  }
  const ctrResult = await handlers.get('seo_ctr_underperformers')?.(ctrParams)
  assert.deepEqual(ctrInput, ctrParams)
  assert.deepEqual(ctrResult?.structuredContent, {
    summary: { verdict: 'CTR fixture.' },
  })

  const clusterParams = {
    site: 'sc-domain:example.com',
    scope: '/guides/',
    minImpressions: 50,
    limit: 20,
    brandTerms: ['Example', 'Example product'],
    includeBrand: false,
    refresh: true,
  }
  const clusterResult = await handlers.get('seo_query_cluster')?.(clusterParams)
  assert.deepEqual(clusterInput, {
    ...clusterParams,
    brand: 'Example',
  })
  assert.deepEqual(clusterResult?.structuredContent, {
    summary: { verdict: 'Cluster fixture.' },
  })
})

test('verified opportunity handlers preserve false and omitted JavaScript options', async () => {
  const handlers = new Map<string, ToolHandler>()
  const quickWinsInputs: Array<{ js?: boolean | 'auto' }> = []
  const internalLinksInputs: Array<{ js?: boolean | 'auto' }> = []

  registerOpportunityTools(
    {
      registerTool(name: string, _config: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
      },
    } as never,
    {
      quickWinsReport: async (input) => {
        quickWinsInputs.push(input)
        return { summary: { verdict: 'Quick wins fixture.' } } as never
      },
      internalLinksReport: async (input) => {
        internalLinksInputs.push(input)
        return { summary: { verdict: 'Internal links fixture.' } } as never
      },
    },
  )

  const site = 'sc-domain:example.com'
  await handlers.get('seo_quick_wins')?.({ site, js: false })
  await handlers.get('seo_quick_wins')?.({ site })
  await handlers.get('seo_internal_links')?.({
    site,
    targetUrl: 'https://example.com/target',
    js: false,
  })
  await handlers.get('seo_internal_links')?.({
    site,
    targetUrl: 'https://example.com/target',
  })

  assert.deepEqual(
    quickWinsInputs.map((input) => input.js),
    [false, undefined],
  )
  assert.deepEqual(
    internalLinksInputs.map((input) => input.js),
    [false, undefined],
  )
})
