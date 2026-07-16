import {
  getTelemetryStatus,
  setTelemetryEnabled,
  type TelemetryDisableReason,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag } from '../args.js'
import { printJson, printKeyValue } from '../utils.js'

const reasonLabels: Record<TelemetryDisableReason, string> = {
  ci: 'disabled automatically in CI or tests',
  do_not_track: 'disabled by DO_NOT_TRACK',
  environment: 'disabled by a telemetry environment variable',
  local_setting: 'disabled in local settings',
  invalid_state: 'disabled because the local state file is invalid',
}

function statusOutput(status: ReturnType<typeof getTelemetryStatus>) {
  return {
    enabled: status.enabled,
    ...(status.reason ? { reason: status.reason } : {}),
    stateFile: status.stateFile,
    ...(status.state
      ? {
          firstRunAt: status.state.firstRunAt,
          cohort: status.state.cohort,
          sentMilestones: status.state.sentMilestones,
        }
      : {}),
  }
}

function printStatus(
  status: ReturnType<typeof getTelemetryStatus>,
  json: boolean,
): void {
  const output = statusOutput(status)
  if (json) {
    printJson(output)
    return
  }
  printKeyValue([
    ['Anonymous telemetry', status.enabled ? 'enabled' : 'disabled'],
    ['Reason', status.reason ? reasonLabels[status.reason] : 'local setting'],
    ['State file', status.stateFile],
    ['Install cohort', status.state?.cohort ?? 'not created'],
  ])
  process.stdout.write(
    '\nOnly tool usage is sent. URLs, report data, Google data, and identifiers are never sent.\n',
  )
  process.stdout.write('Details: https://seoskill.dev/telemetry\n')
}

const jsonArg = {
  type: 'boolean' as const,
  default: false,
  description: 'Print machine-readable JSON.',
}

export const telemetryCommand = defineCommand({
  meta: {
    name: 'telemetry',
    description: 'Check or change anonymous usage telemetry',
  },
  subCommands: {
    status: defineCommand({
      meta: {
        name: 'status',
        description: 'Show whether anonymous usage telemetry is enabled',
      },
      args: { json: jsonArg },
      run: async ({ args }) =>
        printStatus(getTelemetryStatus(), jsonFlag(args)),
    }),
    enable: defineCommand({
      meta: {
        name: 'enable',
        description: 'Enable anonymous usage telemetry in local settings',
      },
      args: { json: jsonArg },
      run: async ({ args }) => {
        printStatus(setTelemetryEnabled(true), jsonFlag(args))
      },
    }),
    disable: defineCommand({
      meta: {
        name: 'disable',
        description: 'Disable anonymous usage telemetry in local settings',
      },
      args: { json: jsonArg },
      run: async ({ args }) => {
        printStatus(setTelemetryEnabled(false), jsonFlag(args))
      },
    }),
  },
})
