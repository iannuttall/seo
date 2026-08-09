/// <reference lib="webworker" />

import {
  renderServerLogCsv,
  type ServerLogCsvName,
  type ServerLogEvidence,
  type ServerLogFormat,
} from '@seo/core/server-logs/browser'
import { analyzeServerLogFile } from '@/lib/server-log-file'

type AnalyzeMessage = {
  type: 'analyze'
  file: File
  format?: ServerLogFormat
}

type ExportMessage = {
  type: 'export'
  name: ServerLogCsvName
}

const scope = self as unknown as DedicatedWorkerGlobalScope
let evidence: ServerLogEvidence | undefined

scope.addEventListener(
  'message',
  async (event: MessageEvent<AnalyzeMessage | ExportMessage>) => {
    try {
      if (event.data.type === 'analyze') {
        evidence = undefined
        const result = await analyzeServerLogFile({
          file: event.data.file,
          format: event.data.format,
          onProgress: (progress) => {
            scope.postMessage({ type: 'progress', ...progress })
          },
        })
        evidence = result.evidence
        scope.postMessage({
          type: 'complete',
          report: result.report,
          errorPaths: result.errorPaths,
        })
        return
      }

      if (!evidence)
        throw new Error('Analyze a server log before exporting CSV.')
      const file = renderServerLogCsv(evidence, event.data.name)
      scope.postMessage({ type: 'export', file })
    } catch (error) {
      scope.postMessage({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'The server log could not be analyzed.',
      })
    }
  },
)
