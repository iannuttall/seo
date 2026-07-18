import type { PageFetchResult } from '../types.js'
import { fetchPlain } from './page-fetcher/plain.js'
import {
  normalizeRateControls,
  queueForHost,
} from './page-fetcher/rate-controls.js'
import {
  createPageRenderer,
  JavaScriptRenderingError,
  looksLikeSpa,
} from './page-fetcher/rendered.js'
import { renderingDocumentDifference } from './page-fetcher/rendering-difference.js'

export { fetchPageStatus } from './page-fetcher/status-probe.js'

import type {
  FetchPageOptions,
  JavaScriptRenderingInput,
  JavaScriptRenderingMode,
} from './page-fetcher/types.js'

export { createPageRenderer } from './page-fetcher/rendered.js'
export type {
  FetchPageOptions,
  FetchRateControls,
  JavaScriptRenderingInput,
  JavaScriptRenderingMode,
  PageRenderer,
} from './page-fetcher/types.js'

export type FetchPageDependencies = {
  fetchPlain?: typeof fetchPlain
  createPageRenderer?: typeof createPageRenderer
}

export function normalizeJavaScriptRenderingMode(
  input: JavaScriptRenderingInput | undefined,
): JavaScriptRenderingMode {
  if (input === true) return 'on'
  if (input === false) return 'off'
  return input ?? 'auto'
}

function rawObservation(result: PageFetchResult) {
  return {
    source: result.diagnostics.source === 'cache' ? 'cache' : 'network',
    cache: result.diagnostics.cache,
    url: result.url,
    finalUrl: result.finalUrl,
    status: result.status,
  } as const
}

function withRenderingState(
  result: PageFetchResult,
  mode: JavaScriptRenderingMode,
  status: NonNullable<PageFetchResult['diagnostics']['rendering']>['status'],
  input: {
    error?: string
    warnings?: string[]
  } = {},
): PageFetchResult {
  return {
    ...result,
    diagnostics: {
      ...result.diagnostics,
      rendering: {
        mode,
        status,
        raw: rawObservation(result),
        ...(input.error ? { error: input.error } : {}),
      },
    },
    warnings: [...result.warnings, ...(input.warnings ?? [])],
  }
}

function renderingFallback(
  result: PageFetchResult,
  mode: JavaScriptRenderingMode,
  error: unknown,
): PageFetchResult {
  const unavailable =
    error instanceof JavaScriptRenderingError &&
    error.kind === 'browser-unavailable'
  const message =
    error instanceof Error ? error.message : 'JavaScript rendering failed.'
  return withRenderingState(
    result,
    mode,
    unavailable ? 'unavailable' : 'failed',
    {
      error: message,
      warnings: [
        `${mode === 'on' ? 'JavaScript rendering was requested' : 'JavaScript rendering was attempted'} but ${unavailable ? 'is unavailable' : 'failed'}. This result uses raw HTTP HTML only, so client-rendered content, metadata, and links may be incomplete. ${message}`,
      ],
    },
  )
}

export async function fetchPage(
  url: string,
  opts: FetchPageOptions = {},
  dependencies: FetchPageDependencies = {},
): Promise<PageFetchResult> {
  const renderingMode = normalizeJavaScriptRenderingMode(opts.js)
  const plainFetch = dependencies.fetchPlain ?? fetchPlain
  const makeRenderer = dependencies.createPageRenderer ?? createPageRenderer
  const rate = normalizeRateControls(opts.rate)
  const queue = queueForHost(new URL(url).host, rate)
  return (await queue.add<PageFetchResult>(async () => {
    const first = await plainFetch(
      url,
      opts.refresh,
      opts.timeoutMs,
      rate,
      opts.signal,
      opts.respectRobots,
      opts.writeCache,
    )
    const shouldRetryJs =
      !first.diagnostics.accessBlock &&
      (renderingMode === 'on' ||
        (renderingMode === 'auto' && looksLikeSpa(first.html)))

    if (!shouldRetryJs || opts.signal?.aborted) {
      return withRenderingState(
        first,
        renderingMode,
        opts.signal?.aborted
          ? 'skipped'
          : renderingMode === 'off'
            ? 'not-requested'
            : 'not-needed',
      )
    }

    const ownsRenderer = !opts.renderer
    const renderer = opts.renderer ?? makeRenderer()
    try {
      const rendered = await renderer.render(url, rate, {
        timeoutMs: opts.timeoutMs,
        signal: opts.signal,
      })
      return {
        ...rendered,
        diagnostics: {
          ...rendered.diagnostics,
          robotsTxt: first.diagnostics.robotsTxt,
          redirectChain: first.diagnostics.redirectChain,
          accessBlock:
            rendered.diagnostics.accessBlock ?? first.diagnostics.accessBlock,
          rendering: {
            ...rendered.diagnostics.rendering,
            mode: renderingMode,
            status: 'rendered',
            raw: rawObservation(first),
            documentDifference: renderingDocumentDifference(first, rendered),
          },
        },
        warnings: [...first.warnings, ...rendered.warnings],
      }
    } catch (error) {
      return renderingFallback(first, renderingMode, error)
    } finally {
      if (ownsRenderer) await renderer.close()
    }
  })) as PageFetchResult
}
