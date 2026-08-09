/// <reference lib="webworker" />

import {
  generateWordCombinations,
  type WordCombinationInput,
} from '@/lib/word-combiner'

type GenerateMessage = {
  type: 'generate'
  input: WordCombinationInput
}

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.addEventListener('message', (event: MessageEvent<GenerateMessage>) => {
  try {
    const result = generateWordCombinations(event.data.input, (processed) => {
      scope.postMessage({ type: 'progress', processed })
    })
    scope.postMessage({ type: 'complete', result })
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'The combinations could not be generated.',
    })
  }
})
