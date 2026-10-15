import { defineCommand } from 'citty'
import { exportRefreshPrioritiesCommand } from './refresh-priorities.js'
import { exportUpdatePostmortemCommand } from './update-postmortem.js'

export const exportCommand = defineCommand({
  meta: {
    name: 'export',
    description: 'Export full report data to CSV files',
  },
  subCommands: {
    'update-postmortem': exportUpdatePostmortemCommand,
    'refresh-priorities': exportRefreshPrioritiesCommand,
  },
})
