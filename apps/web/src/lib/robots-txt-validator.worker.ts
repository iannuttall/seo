import {
  analyseRobotsTxt,
  type RobotsAnalysis,
} from './robots-txt-validator.ts'

export type RobotsWorkerRequest = {
  id: number
  content: string
  origin: string
  urls: string[]
  userAgent: string
}

export type RobotsWorkerResponse =
  | { id: number; ok: true; analysis: RobotsAnalysis }
  | { id: number; ok: false; error: string }

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<RobotsWorkerRequest>) => void) | null
  postMessage(message: RobotsWorkerResponse): void
}

worker.onmessage = (event) => {
  try {
    worker.postMessage({
      id: event.data.id,
      ok: true,
      analysis: analyseRobotsTxt(event.data),
    })
  } catch (error) {
    worker.postMessage({
      id: event.data.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
