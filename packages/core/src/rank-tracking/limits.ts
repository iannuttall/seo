export const RANK_TRACKING_LIMITS = {
  configurationsPerProject: 25,
  totalConfigurations: 100,
  liveKeywordsPerRun: 50,
  queuedKeywordsPerRun: 1_000,
  devicesPerRun: 2,
  tasksPerProviderPost: 100,
  retainedRunsPerConfiguration: 90,
  outputRows: 250,
  logicalBytes: 256 * 1024 * 1024,
} as const
