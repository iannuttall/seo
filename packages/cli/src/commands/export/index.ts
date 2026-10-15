import { defineCommand } from 'citty'
import { exportDiagnoseCommand } from './diagnose.js'
import { exportRefreshPrioritiesCommand } from './refresh-priorities.js'
import { exportUpdatePostmortemCommand } from './update-postmortem.js'

export const exportCommand = defineCommand({
  meta: {
    name: 'export',
    description: 'Export full report data to CSV files',
  },
  subCommands: {
    diagnose: exportDiagnoseCommand,
    'update-postmortem': exportUpdatePostmortemCommand,
    'refresh-priorities': exportRefreshPrioritiesCommand,
  },
})
