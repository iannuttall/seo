// The writing linter. Worker-safe: no Node built-ins. File reading lives in
// ./files.ts for the CLI and the local MCP.

export { defaultPreset, formatFromPath } from './extract.js'
export {
  LINT_REVIEW_LENSES,
  LINT_RULES,
  type LintFileResult,
  lintReportText,
  lintRulesText,
  lintText,
} from './lint.js'
export * from './types.js'
