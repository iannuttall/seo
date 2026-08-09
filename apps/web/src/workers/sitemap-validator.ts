/// <reference lib="webworker" />

import {
  type SitemapValidationReport,
  type SitemapValidationSource,
  validateSitemapByteStream,
} from '@/lib/sitemap-validator'

type ValidateMessage =
  | { type: 'validate-file'; file: File }
  | { type: 'validate-paste'; content: string }

type WorkerResponse =
  | { type: 'progress'; source: SitemapValidationSource }
  | { type: 'complete'; report: SitemapValidationReport }
  | { type: 'error'; message: string }

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.addEventListener(
  'message',
  async (event: MessageEvent<ValidateMessage>) => {
    try {
      const input = event.data
      if (input.type === 'validate-file' && input.file.size < 1) {
        throw new Error('Choose a non-empty sitemap file.')
      }
      const report = await validateSitemapByteStream({
        body:
          input.type === 'validate-file'
            ? input.file.stream()
            : new Blob([input.content]).stream(),
        source:
          input.type === 'validate-file'
            ? { kind: 'file', name: input.file.name }
            : { kind: 'paste' },
        onProgress: (source) => {
          const message: WorkerResponse = { type: 'progress', source }
          scope.postMessage(message)
        },
      })
      const message: WorkerResponse = { type: 'complete', report }
      scope.postMessage(message)
    } catch (error) {
      const message: WorkerResponse = {
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'The sitemap could not be validated.',
      }
      scope.postMessage(message)
    }
  },
)
