import {
  analyzeServerLogChunks,
  BROWSER_SERVER_LOG_LIMITS,
  type ServerLogAnalysisProgress,
  type ServerLogEvidence,
  type ServerLogFormat,
  serverLogErrorPaths,
  serverLogFormatForFilename,
  serverLogReport,
} from '@seo/core/server-logs/browser'

export type BrowserServerLogAnalysis = {
  evidence: ServerLogEvidence
  report: ReturnType<typeof serverLogReport>
  errorPaths: ReturnType<typeof serverLogErrorPaths>
}

async function* fileChunks(file: File): AsyncGenerator<Uint8Array> {
  const reader = file.stream().getReader()
  let complete = false
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        complete = true
        return
      }
      yield chunk.value
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export async function analyzeServerLogFile(input: {
  file: File
  format?: ServerLogFormat
  observedAt?: string
  onProgress?: (progress: ServerLogAnalysisProgress) => void
}): Promise<BrowserServerLogAnalysis> {
  if (input.file.size < 1)
    throw new Error('Choose a non-empty server log file.')
  if (input.file.size > BROWSER_SERVER_LOG_LIMITS.bytes) {
    throw new Error(
      `Choose a server log smaller than ${BROWSER_SERVER_LOG_LIMITS.bytes.toLocaleString()} bytes.`,
    )
  }

  const evidence = await analyzeServerLogChunks({
    chunks: fileChunks(input.file),
    file: { path: input.file.name, fileBytes: input.file.size },
    format: serverLogFormatForFilename(input.file.name, input.format),
    rowLimit: BROWSER_SERVER_LOG_LIMITS.rows,
    pathLimit: BROWSER_SERVER_LOG_LIMITS.paths,
    byteLimit: BROWSER_SERVER_LOG_LIMITS.bytes,
    maxLineBytes: BROWSER_SERVER_LOG_LIMITS.lineBytes,
    observedAt: input.observedAt,
    onProgress: input.onProgress,
  })

  return {
    evidence,
    report: serverLogReport({
      evidence,
      limit: BROWSER_SERVER_LOG_LIMITS.reportPaths,
    }),
    errorPaths: serverLogErrorPaths(evidence).slice(
      0,
      BROWSER_SERVER_LOG_LIMITS.reportPaths,
    ),
  }
}
