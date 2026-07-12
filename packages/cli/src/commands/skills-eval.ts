import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import {
  defaultTrueBooleanArg,
  jsonFlag,
  numberArg,
  stringArg,
} from '../args.js'
import { printJson } from '../utils.js'
import { evalsDirectory, skillsDirectory } from './skill-paths.js'

const SCHEMA_VERSION = 1
const DEFAULT_AGENT = 'claude -p'
const DEFAULT_TIMEOUT_SECONDS = 300
const MAX_CONCURRENCY = 4
const ROUTER_SKILL = 'seo'

type EvalItem = {
  id: number
  prompt: string
  expected_output: string
  assertions: string[]
  files: string[]
}

type EvalFile = {
  subject: string
  evals: EvalItem[]
}

type AssertionVerdict = {
  assertion: string
  verdict: 'pass' | 'fail' | 'unjudged'
  reason?: string
  source?: 'judge verdict'
}

type EvalStatus = 'passed' | 'failed' | 'errored' | 'unjudged'

type EvalResult = {
  id: number
  prompt: string
  status: EvalStatus
  reply: string
  error?: string
  agentDurationMs: number
  judgeDurationMs?: number
  durationMs: number
  assertions: AssertionVerdict[]
}

type SubjectResult = {
  subject: string
  passed: number
  failed: number
  errored: number
  unjudged: number
  evals: EvalResult[]
}

function listSubjectFiles(): Array<{ subject: string; path: string }> {
  const root = evalsDirectory()
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => ({
      subject: basename(entry.name, '.json'),
      path: join(root, entry.name),
    }))
    .sort((a, b) =>
      a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0,
    )
}

export function loadEvalFile(subject: string, path: string): EvalFile {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    throw new SeoError('INVALID_INPUT', `Cannot read eval file for ${subject}.`)
  }
  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch {
    throw new SeoError(
      'INVALID_INPUT',
      `Eval file ${subject}.json is not valid JSON.`,
    )
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new SeoError(
      'INVALID_INPUT',
      `Eval file ${subject}.json must be an object.`,
    )
  }
  const record = doc as Record<string, unknown>
  if (record.subject !== subject) {
    throw new SeoError(
      'INVALID_INPUT',
      `Eval file ${subject}.json must set subject to "${subject}".`,
    )
  }
  if (!Array.isArray(record.evals) || record.evals.length === 0) {
    throw new SeoError(
      'INVALID_INPUT',
      `Eval file ${subject}.json must have a non-empty evals array.`,
    )
  }
  const seen = new Set<number>()
  const evals: EvalItem[] = record.evals.map((entry, index) => {
    const item = entry as Record<string, unknown>
    const label = `${subject}.json eval ${index + 1}`
    if (!Number.isInteger(item?.id)) {
      throw new SeoError('INVALID_INPUT', `${label}: id must be an integer.`)
    }
    const id = item.id as number
    if (seen.has(id)) {
      throw new SeoError('INVALID_INPUT', `${label}: duplicate id ${id}.`)
    }
    seen.add(id)
    if (typeof item.prompt !== 'string' || item.prompt.trim().length === 0) {
      throw new SeoError(
        'INVALID_INPUT',
        `${label}: prompt must be a non-empty string.`,
      )
    }
    if (
      typeof item.expected_output !== 'string' ||
      item.expected_output.trim().length === 0
    ) {
      throw new SeoError(
        'INVALID_INPUT',
        `${label}: expected_output must be a non-empty string.`,
      )
    }
    if (
      !Array.isArray(item.assertions) ||
      item.assertions.length === 0 ||
      item.assertions.some(
        (value) => typeof value !== 'string' || value.trim().length === 0,
      )
    ) {
      throw new SeoError(
        'INVALID_INPUT',
        `${label}: assertions must be a non-empty array of non-empty strings.`,
      )
    }
    if (item.files !== undefined && !Array.isArray(item.files)) {
      throw new SeoError('INVALID_INPUT', `${label}: files must be an array.`)
    }
    return {
      id,
      prompt: item.prompt,
      expected_output: item.expected_output,
      assertions: item.assertions as string[],
      files: (item.files as string[] | undefined) ?? [],
    }
  })
  return { subject, evals }
}

function routerSkillBody(): string {
  const path = join(skillsDirectory(), ROUTER_SKILL, 'SKILL.md')
  if (!existsSync(path)) {
    throw new SeoError(
      'INTERNAL_ERROR',
      'The seo router skill could not be found. Reinstall `seo` or use --no-skill.',
    )
  }
  return readFileSync(path, 'utf8')
}

// Split a command template into argv tokens without a shell. Single quotes,
// double quotes, and backslash escapes group tokens; nothing is expanded, so a
// substituted prompt can never break out into extra arguments or shell syntax.
export function tokenizeCommand(command: string): string[] {
  const tokens: string[] = []
  let current = ''
  let started = false
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i] as string
    if (inSingle) {
      if (ch === "'") inSingle = false
      else current += ch
      started = true
      continue
    }
    if (inDouble) {
      if (ch === '"') {
        inDouble = false
      } else if (
        ch === '\\' &&
        (command[i + 1] === '"' || command[i + 1] === '\\')
      ) {
        current += command[i + 1]
        i += 1
      } else {
        current += ch
      }
      started = true
      continue
    }
    if (ch === "'") {
      inSingle = true
      started = true
      continue
    }
    if (ch === '"') {
      inDouble = true
      started = true
      continue
    }
    if (ch === '\\') {
      if (i + 1 < command.length) {
        current += command[i + 1]
        i += 1
        started = true
      }
      continue
    }
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      if (started) {
        tokens.push(current)
        current = ''
        started = false
      }
      continue
    }
    current += ch
    started = true
  }
  if (inSingle || inDouble) {
    throw new SeoError('INVALID_INPUT', 'Unbalanced quote in agent command.')
  }
  if (started) tokens.push(current)
  return tokens
}

export function buildArgv(
  template: string,
  prompt: string,
): { argv: string[]; usesPlaceholder: boolean } {
  const tokens = tokenizeCommand(template)
  if (tokens.length === 0) {
    throw new SeoError('INVALID_INPUT', 'Agent command must not be empty.')
  }
  const usesPlaceholder = tokens.some((token) => token.includes('{prompt}'))
  const argv = usesPlaceholder
    ? tokens.map((token) => token.split('{prompt}').join(prompt))
    : tokens
  return { argv, usesPlaceholder }
}

export function assembleAgentPrompt(
  skillBody: string | null,
  prompt: string,
): string {
  if (!skillBody) return prompt
  return `${skillBody.trim()}\n\n---\n\nUser request:\n${prompt}`
}

const JUDGE_CORRECTION =
  'Your previous reply could not be parsed as the required JSON with one result per assertion. Reply again with STRICT JSON only, in the exact shape shown, and nothing else.'

export function buildJudgePrompt(
  prompt: string,
  reply: string,
  assertions: string[],
  corrective = false,
): string {
  const list = assertions
    .map((entry, index) => `${index + 1}. ${entry}`)
    .join('\n')
  const base = [
    'You are judging whether an AI agent response satisfies a list of assertions.',
    'Judge only against the assertions. Be strict but fair.',
    '',
    'Original request:',
    prompt,
    '',
    'Agent response:',
    reply,
    '',
    'Assertions to evaluate, in this exact order:',
    '<assertions>',
    list,
    '</assertions>',
    '',
    'Judge outcomes, not narration. An assertion about reading, checking, or',
    'following fields or steps passes when the reply demonstrably used that',
    'information or produced the result it protects, even if the reply never',
    'names the field or step. Fail it only when the reply contradicts it or',
    'shows the work was not done.',
    '',
    'Reply with STRICT JSON only. No prose, no markdown, no code fence:',
    '{"results":[{"assertion":"<assertion text>","pass":true,"reason":"<short reason>"}]}',
    `Return exactly ${assertions.length} result${assertions.length === 1 ? '' : 's'}, one per assertion, in the same order.`,
  ].join('\n')
  return corrective ? `${base}\n\n${JUDGE_CORRECTION}` : base
}

// Pull the first complete JSON object out of a larger reply. Judges wrap JSON
// in prose or code fences, so scan for the first balanced `{...}` and parse it.
export function extractJsonObject(text: string): unknown | undefined {
  const start = text.indexOf('{')
  if (start === -1) return undefined
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}

type ParsedVerdicts = { verdicts: AssertionVerdict[] } | { error: string }

export function parseJudgeVerdicts(
  output: string,
  assertions: string[],
): ParsedVerdicts {
  const parsed = extractJsonObject(output)
  if (!parsed || typeof parsed !== 'object') {
    return { error: 'Judge reply did not contain a JSON object.' }
  }
  const results = (parsed as Record<string, unknown>).results
  if (!Array.isArray(results)) {
    return { error: 'Judge reply had no results array.' }
  }
  if (results.length !== assertions.length) {
    return {
      error: `Judge returned ${results.length} results for ${assertions.length} assertions.`,
    }
  }
  const verdicts = assertions.map((assertion, index) => {
    const entry = results[index] as Record<string, unknown>
    return {
      assertion,
      verdict: entry?.pass === true ? 'pass' : 'fail',
      reason:
        typeof entry?.reason === 'string' && entry.reason.trim().length > 0
          ? entry.reason.trim()
          : 'No reason given.',
      source: 'judge verdict' as const,
    } satisfies AssertionVerdict
  })
  return { verdicts }
}

type ProcessResult = {
  stdout: string
  stderr: string
  code: number | null
  timedOut: boolean
  spawnError?: string
  durationMs: number
}

function runProcess(
  argv: string[],
  options: { input?: string; timeoutMs: number },
): Promise<ProcessResult> {
  return new Promise((resolvePromise) => {
    const start = Date.now()
    const [command, ...rest] = argv
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command as string, rest, {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolvePromise({
        stdout: '',
        stderr: '',
        code: null,
        timedOut: false,
        spawnError: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      })
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    let killTimer: NodeJS.Timeout | undefined
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // process already gone
        }
      }, 2000)
      killTimer.unref()
    }, options.timeoutMs)
    const finish = (result: Omit<ProcessResult, 'durationMs'>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      resolvePromise({ ...result, durationMs: Date.now() - start })
    }
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      finish({
        stdout,
        stderr,
        code: null,
        timedOut,
        spawnError: error.message,
      })
    })
    child.on('close', (code) => {
      finish({ stdout, stderr, code, timedOut })
    })
    if (child.stdin) {
      if (options.input !== undefined) child.stdin.end(options.input)
      else child.stdin.end()
    }
  })
}

async function runCommandTemplate(
  template: string,
  prompt: string,
  timeoutMs: number,
): Promise<ProcessResult> {
  const { argv, usesPlaceholder } = buildArgv(template, prompt)
  return runProcess(argv, {
    input: usesPlaceholder ? undefined : prompt,
    timeoutMs,
  })
}

type RunOptions = {
  agent: string
  judge: string | null
  skillBody: string | null
  timeoutMs: number
}

async function runSingleEval(
  item: EvalItem,
  options: RunOptions,
): Promise<EvalResult> {
  const start = Date.now()
  const agentPrompt = assembleAgentPrompt(options.skillBody, item.prompt)
  const agentRun = await runCommandTemplate(
    options.agent,
    agentPrompt,
    options.timeoutMs,
  )
  const reply = agentRun.stdout.trim()

  const base = {
    id: item.id,
    prompt: item.prompt,
    reply,
    agentDurationMs: agentRun.durationMs,
  }

  if (agentRun.spawnError) {
    return {
      ...base,
      status: 'errored',
      error: `Agent command failed to start: ${agentRun.spawnError}`,
      durationMs: Date.now() - start,
      assertions: unjudgedAssertions(item.assertions),
    }
  }
  if (agentRun.timedOut) {
    return {
      ...base,
      status: 'errored',
      error: `Agent timed out after ${Math.round(options.timeoutMs / 1000)}s.`,
      durationMs: Date.now() - start,
      assertions: unjudgedAssertions(item.assertions),
    }
  }
  if (reply.length === 0) {
    return {
      ...base,
      status: 'errored',
      error: 'Agent returned no output on stdout.',
      durationMs: Date.now() - start,
      assertions: unjudgedAssertions(item.assertions),
    }
  }

  if (!options.judge) {
    return {
      ...base,
      status: 'unjudged',
      durationMs: Date.now() - start,
      assertions: unjudgedAssertions(item.assertions),
    }
  }

  let judgeDurationMs = 0
  let parseError = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const judgePrompt = buildJudgePrompt(
      item.prompt,
      reply,
      item.assertions,
      attempt > 0,
    )
    const judgeRun = await runCommandTemplate(
      options.judge,
      judgePrompt,
      options.timeoutMs,
    )
    judgeDurationMs += judgeRun.durationMs
    if (judgeRun.spawnError) {
      return {
        ...base,
        status: 'errored',
        error: `Judge command failed to start: ${judgeRun.spawnError}`,
        judgeDurationMs,
        durationMs: Date.now() - start,
        assertions: unjudgedAssertions(item.assertions),
      }
    }
    if (judgeRun.timedOut) {
      return {
        ...base,
        status: 'errored',
        error: `Judge timed out after ${Math.round(options.timeoutMs / 1000)}s.`,
        judgeDurationMs,
        durationMs: Date.now() - start,
        assertions: unjudgedAssertions(item.assertions),
      }
    }
    const parsed = parseJudgeVerdicts(judgeRun.stdout, item.assertions)
    if ('verdicts' in parsed) {
      const failed = parsed.verdicts.some((entry) => entry.verdict === 'fail')
      return {
        ...base,
        status: failed ? 'failed' : 'passed',
        judgeDurationMs,
        durationMs: Date.now() - start,
        assertions: parsed.verdicts,
      }
    }
    parseError = parsed.error
  }

  return {
    ...base,
    status: 'errored',
    error: `Judge output could not be parsed after a retry: ${parseError}`,
    judgeDurationMs,
    durationMs: Date.now() - start,
    assertions: unjudgedAssertions(item.assertions),
  }
}

function unjudgedAssertions(assertions: string[]): AssertionVerdict[] {
  return assertions.map((assertion) => ({ assertion, verdict: 'unjudged' }))
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (true) {
      const index = next
      next += 1
      if (index >= items.length) return
      results[index] = await fn(items[index] as T, index)
    }
  }
  const size = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: size }, () => worker()))
  return results
}

function tally(evals: EvalResult[]): {
  passed: number
  failed: number
  errored: number
  unjudged: number
} {
  const counts = { passed: 0, failed: 0, errored: 0, unjudged: 0 }
  for (const item of evals) counts[item.status] += 1
  return counts
}

function collectSubjects(args: Record<string, unknown>): string[] {
  const raw: string[] = []
  const first = stringArg(args.subject)
  if (first) raw.push(first)
  const rest = args._
  if (Array.isArray(rest)) {
    for (const value of rest) {
      if (typeof value === 'string' && value.length > 0) raw.push(value)
    }
  }
  return [...new Set(raw)]
}

function resolveSelectedSubjects(requested: string[]): Array<{
  subject: string
  path: string
}> {
  const available = listSubjectFiles()
  if (requested.length === 0) return available
  const byName = new Map(available.map((entry) => [entry.subject, entry]))
  return requested.map((subject) => {
    const match = byName.get(subject)
    if (!match) {
      const known = available.map((entry) => entry.subject).join(', ')
      throw new SeoError(
        'INVALID_INPUT',
        `Unknown eval subject: ${subject}.${known ? ` Known subjects: ${known}.` : ''}`,
      )
    }
    return match
  })
}

function renderList(json: boolean): void {
  const subjects = listSubjectFiles().map((entry) => {
    const doc = loadEvalFile(entry.subject, entry.path)
    return { subject: entry.subject, evals: doc.evals.length }
  })
  if (json) {
    printJson({ schemaVersion: SCHEMA_VERSION, subjects })
    return
  }
  if (subjects.length === 0) {
    process.stdout.write('No eval subjects found.\n')
    return
  }
  const width = Math.max(...subjects.map((entry) => entry.subject.length))
  process.stdout.write('Eval subjects\n')
  for (const entry of subjects) {
    const label = entry.evals === 1 ? 'eval' : 'evals'
    process.stdout.write(
      `  ${entry.subject.padEnd(width)}  ${entry.evals} ${label}\n`,
    )
  }
}

function statusLabel(status: EvalStatus): string {
  if (status === 'passed') return 'PASS'
  if (status === 'failed') return 'FAIL'
  if (status === 'errored') return 'ERROR'
  return 'UNJUDGED'
}

function renderHuman(
  subjects: SubjectResult[],
  options: { judged: boolean; agent: string; judge: string | null },
): void {
  if (options.judged) {
    process.stdout.write(
      'Assertion verdicts below are judge verdicts, model judgments from the judge agent, not ground truth.\n\n',
    )
  } else {
    process.stdout.write(
      'Judging was skipped. Review each agent reply against the assertion checklist by hand.\n\n',
    )
  }
  for (const subject of subjects) {
    process.stdout.write(`# ${subject.subject}\n`)
    for (const item of subject.evals) {
      process.stdout.write(
        `\n[${statusLabel(item.status)}] eval ${item.id} (${item.durationMs}ms)\n`,
      )
      process.stdout.write(`  prompt: ${truncate(item.prompt, 100)}\n`)
      if (item.error) {
        process.stdout.write(`  error: ${item.error}\n`)
      }
      if (!options.judged) {
        process.stdout.write(`  reply: ${truncate(item.reply, 200)}\n`)
        process.stdout.write('  assertions to review:\n')
        for (const verdict of item.assertions) {
          process.stdout.write(`    - [ ] ${verdict.assertion}\n`)
        }
        continue
      }
      for (const verdict of item.assertions) {
        const mark =
          verdict.verdict === 'pass'
            ? 'pass'
            : verdict.verdict === 'fail'
              ? 'fail'
              : 'unjudged'
        process.stdout.write(`  - ${mark}: ${verdict.assertion}\n`)
        if (verdict.reason) {
          process.stdout.write(`      judge verdict: ${verdict.reason}\n`)
        }
      }
    }
    const counts = tally(subject.evals)
    process.stdout.write(
      `\nSubject ${subject.subject}: ${counts.passed} passed, ${counts.failed} failed, ${counts.errored} errored${counts.unjudged ? `, ${counts.unjudged} unjudged` : ''}.\n\n`,
    )
  }
  const totals = totalCounts(subjects)
  process.stdout.write(
    `Totals: ${totals.passed} passed, ${totals.failed} failed, ${totals.errored} errored${totals.unjudged ? `, ${totals.unjudged} unjudged` : ''} across ${totals.evals} evals.\n`,
  )
}

function totalCounts(subjects: SubjectResult[]): {
  passed: number
  failed: number
  errored: number
  unjudged: number
  evals: number
} {
  const totals = { passed: 0, failed: 0, errored: 0, unjudged: 0, evals: 0 }
  for (const subject of subjects) {
    totals.passed += subject.passed
    totals.failed += subject.failed
    totals.errored += subject.errored
    totals.unjudged += subject.unjudged
    totals.evals += subject.evals.length
  }
  return totals
}

function truncate(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed
}

export const skillsEvalCommand = defineCommand({
  meta: {
    name: 'eval',
    description:
      'Run behaviour evals for the seo skill against a local agent and judge the results',
  },
  args: {
    subject: {
      type: 'positional',
      required: false,
      description:
        'Eval subject (report id or job). Omit to run every subject.',
    },
    list: {
      type: 'boolean',
      default: false,
      description: 'List eval subjects with their eval counts and exit.',
    },
    id: {
      type: 'string',
      description: 'Run one eval id within a single subject.',
    },
    agent: {
      type: 'string',
      default: DEFAULT_AGENT,
      description:
        'Agent command. Use {prompt} to place the prompt in argv, otherwise it is sent on stdin.',
    },
    'judge-agent': {
      type: 'string',
      description: 'Judge command. Defaults to the same command as --agent.',
    },
    judge: defaultTrueBooleanArg(
      'Judge assertions with an agent.',
      'Skip judging and print replies with an assertion checklist.',
    ),
    skill: defaultTrueBooleanArg(
      'Send the seo router skill as context before the prompt.',
      'Omit the seo router skill context.',
    ),
    timeout: {
      type: 'string',
      default: String(DEFAULT_TIMEOUT_SECONDS),
      description: 'Timeout in seconds per agent or judge call.',
    },
    concurrency: {
      type: 'string',
      default: '1',
      description: `Evals to run in parallel (max ${MAX_CONCURRENCY}).`,
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)

    if (args.list === true) {
      renderList(json)
      return
    }

    const requested = collectSubjects(args)
    const selected = resolveSelectedSubjects(requested)

    const idFilter = numberArg(args.id)
    if (idFilter !== undefined && selected.length !== 1) {
      throw new SeoError(
        'INVALID_INPUT',
        '--id needs exactly one subject. Name the subject to filter.',
      )
    }

    const timeoutSeconds = numberArg(args.timeout) ?? DEFAULT_TIMEOUT_SECONDS
    if (!(timeoutSeconds > 0)) {
      throw new SeoError(
        'INVALID_INPUT',
        '--timeout must be a positive number of seconds.',
      )
    }
    const concurrency = Math.max(
      1,
      Math.min(MAX_CONCURRENCY, numberArg(args.concurrency) ?? 1),
    )

    const agent = stringArg(args.agent) ?? DEFAULT_AGENT
    const judgeEnabled = args.judge !== false
    const judge = judgeEnabled
      ? (stringArg(args['judge-agent']) ?? agent)
      : null
    const skillBody = args.skill === false ? null : routerSkillBody()

    const runOptions: RunOptions = {
      agent,
      judge,
      skillBody,
      timeoutMs: timeoutSeconds * 1000,
    }

    const subjectResults: SubjectResult[] = []
    for (const entry of selected) {
      const doc = loadEvalFile(entry.subject, entry.path)
      let items = doc.evals
      if (idFilter !== undefined) {
        items = items.filter((item) => item.id === idFilter)
        if (items.length === 0) {
          throw new SeoError(
            'INVALID_INPUT',
            `No eval with id ${idFilter} in subject ${entry.subject}.`,
          )
        }
      }
      if (!json) {
        process.stderr.write(
          `Running ${items.length} eval${items.length === 1 ? '' : 's'} for ${entry.subject}...\n`,
        )
      }
      const evals = await mapWithConcurrency(items, concurrency, (item) =>
        runSingleEval(item, runOptions),
      )
      const counts = tally(evals)
      subjectResults.push({ subject: entry.subject, ...counts, evals })
    }

    const totals = totalCounts(subjectResults)
    const failed = totals.failed > 0 || totals.errored > 0

    if (json) {
      printJson({
        schemaVersion: SCHEMA_VERSION,
        agent,
        judge,
        judged: judge !== null,
        skillContext: skillBody !== null,
        timeoutSeconds,
        concurrency,
        subjects: subjectResults,
        totals,
      })
    } else {
      renderHuman(subjectResults, { judged: judge !== null, agent, judge })
    }

    if (failed) process.exitCode = 1
  },
})
