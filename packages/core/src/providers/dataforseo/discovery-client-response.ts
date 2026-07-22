import type { DataForSeoDiscoveryResponse } from './discovery-schema.js'

export function discoveryRows(response: DataForSeoDiscoveryResponse): number {
  return response.tasks.reduce(
    (taskTotal, task) =>
      taskTotal +
      (task.result ?? []).reduce(
        (resultTotal, result) => resultTotal + (result.items?.length ?? 0),
        0,
      ),
    0,
  )
}

export function discoveryTotalRows(
  response: DataForSeoDiscoveryResponse,
): number | null {
  const totals = response.tasks.flatMap((task) =>
    (task.result ?? []).flatMap((result) =>
      typeof result.total_count === 'number' ? [result.total_count] : [],
    ),
  )
  return totals.length ? totals.reduce((sum, value) => sum + value, 0) : null
}

export function discoveryNextCursor(
  response: DataForSeoDiscoveryResponse,
): string | null {
  const cursors = response.tasks.flatMap((task) =>
    (task.result ?? []).flatMap((result) =>
      result.offset_token ? [result.offset_token] : [],
    ),
  )
  return cursors.length === 1 ? (cursors[0] ?? null) : null
}
