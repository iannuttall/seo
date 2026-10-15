import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('../index.js', import.meta.url))

// One temp workspace holds fake skills, fake evals, and fake agent/judge
// scripts so tests never touch a real agent.
const workspace = mkdtempSync(join(tmpdir(), 'seo-eval-test-'))
const skillsDir = join(workspace, 'skills')
const evalsDir = join(workspace, 'evals')
const agentScript = join(workspace, 'agent.js')
const judgeScript = join(workspace, 'judge.js')

mkdirSync(join(skillsDir, 'seo'), { recursive: true })
mkdirSync(evalsDir, { recursive: true })
writeFileSync(join(skillsDir, 'README.md'), 'skills readme\n')
writeFileSync(
  join(skillsDir, 'seo', 'SKILL.md'),
  'name: seo\nROUTER BODY MARKER\n',
)

// Agent fixture: echo the prompt back so tests can assert argv integrity. The
// prompt arrives as argv[2] when {prompt} is used, otherwise on stdin.
writeFileSync(
  agentScript,
  [
    'let input = "";',
    'if (process.argv.length > 2) { process.stdout.write("REPLY:" + process.argv[2]); process.exit(0); }',
    'process.stdin.on("data", (d) => (input += d));',
    'process.stdin.on("end", () => process.stdout.write("REPLY-STDIN:" + input));',
  ].join('\n'),
)

// Judge fixture: count numbered assertions inside <assertions> and return one
// verdict each. Modes drive fail, wrong-count, and malformed-then-valid retry.
writeFileSync(
  judgeScript,
  [
    'const fs = require("fs");',
    'let input = "";',
    'process.stdin.on("data", (d) => (input += d));',
    'process.stdin.on("end", () => {',
    '  const m = input.match(/<assertions>([\\s\\S]*?)<\\/assertions>/);',
    '  const n = ((m ? m[1] : "").match(/^\\s*\\d+\\.\\s/gm) || []).length;',
    '  const mode = process.env.SEO_TEST_JUDGE || "pass";',
    '  const state = process.env.SEO_TEST_STATE;',
    '  let count = 0;',
    '  if (state) { try { count = Number(fs.readFileSync(state, "utf8")) || 0; } catch {} count += 1; fs.writeFileSync(state, String(count)); }',
    '  if (mode === "malformed_then_valid" && count === 1) { process.stdout.write("not json at all"); return; }',
    '  if (mode === "wrongcount") { process.stdout.write(JSON.stringify({ results: [] })); return; }',
    '  const pass = mode !== "fail";',
    '  const results = Array.from({ length: n }, (_, i) => ({ assertion: "a" + i, pass, reason: pass ? "ok" : "missing" }));',
    '  process.stdout.write("Verdict:\\n```json\\n" + JSON.stringify({ results }) + "\\n```\\n");',
    '});',
  ].join('\n'),
)

writeFileSync(
  join(evalsDir, 'demo.json'),
  JSON.stringify({
    subject: 'demo',
    evals: [
      {
        id: 1,
        prompt: 'First prompt',
        expected_output: 'does the thing',
        assertions: ['asserts one', 'asserts two'],
        files: [],
      },
      {
        id: 2,
        prompt: 'Second prompt',
        expected_output: 'does another',
        assertions: ['asserts three'],
        files: [],
      },
    ],
  }),
)
writeFileSync(
  join(evalsDir, 'other.json'),
  JSON.stringify({
    subject: 'other',
    evals: [
      {
        id: 1,
        prompt: 'Other prompt',
        expected_output: 'x',
        assertions: ['only one'],
        files: [],
      },
    ],
  }),
)

process.on('exit', () => {
  rmSync(workspace, { recursive: true, force: true })
})

const agentTemplate = `node ${agentScript} {prompt}`
const judgeTemplate = `node ${judgeScript}`

async function runEval(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        ...env,
        CI: '1',
        NO_UPDATE_NOTIFIER: '1',
        SEO_SKILLS_DIR: skillsDir,
        SEO_EVALS_DIR: evalsDir,
      },
      timeout: 20_000,
      maxBuffer: 10 * 1024 * 1024,
    })
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const result = error as { code?: number; stdout?: string; stderr?: string }
    return {
      exitCode: typeof result.code === 'number' ? result.code : 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    }
  }
}

test('a passing run returns judged verdicts and exit 0', async () => {
  const result = await runEval([
    'skill',
    'eval',
    'demo',
    'other',
    '--agent',
    agentTemplate,
    '--judge-agent',
    judgeTemplate,
    '--json',
  ])
  assert.equal(result.exitCode, 0)
  const doc = JSON.parse(result.stdout) as {
    schemaVersion: number
    judged: boolean
    skillContext: boolean
    agent: string
    judge: string
    subjects: Array<{
      subject: string
      evals: Array<{
        status: string
        reply: string
        durationMs: number
        assertions: Array<{ verdict: string; source?: string; reason?: string }>
      }>
    }>
    totals: { passed: number; failed: number; errored: number; evals: number }
  }
  assert.equal(doc.schemaVersion, 1)
  assert.equal(doc.judged, true)
  assert.equal(doc.skillContext, true)
  assert.equal(doc.totals.evals, 3)
  assert.equal(doc.totals.passed, 3)
  const first = doc.subjects[0]?.evals[0]
  assert.equal(first?.status, 'passed')
  assert.equal(first?.assertions[0]?.verdict, 'pass')
  assert.equal(first?.assertions[0]?.source, 'judge verdict')
  assert.ok(typeof first?.durationMs === 'number')
  // The skill body reaches the agent, proving skill context assembly.
  assert.match(first?.reply ?? '', /ROUTER BODY MARKER/)
})

test('a failed assertion exits 1', async () => {
  const result = await runEval(
    [
      'skill',
      'eval',
      'other',
      '--agent',
      agentTemplate,
      '--judge-agent',
      judgeTemplate,
      '--json',
    ],
    { SEO_TEST_JUDGE: 'fail' },
  )
  assert.equal(result.exitCode, 1)
  const doc = JSON.parse(result.stdout) as {
    totals: { failed: number }
    subjects: Array<{ evals: Array<{ status: string }> }>
  }
  assert.equal(doc.totals.failed, 1)
  assert.equal(doc.subjects[0]?.evals[0]?.status, 'failed')
})

test('a shell-unsafe prompt reaches the agent as one argument', async () => {
  const sentinel = join(workspace, 'INJECTED')
  rmSync(sentinel, { force: true })
  const injection = `boom; touch ${sentinel}; echo done`
  writeFileSync(
    join(evalsDir, 'inject.json'),
    JSON.stringify({
      subject: 'inject',
      evals: [
        {
          id: 1,
          prompt: injection,
          expected_output: 'x',
          assertions: ['only one'],
          files: [],
        },
      ],
    }),
  )
  const result = await runEval([
    'skill',
    'eval',
    'inject',
    '--agent',
    agentTemplate,
    '--no-skill',
    '--no-judge',
    '--json',
  ])
  rmSync(join(evalsDir, 'inject.json'), { force: true })
  assert.equal(result.exitCode, 0)
  const doc = JSON.parse(result.stdout) as {
    subjects: Array<{ evals: Array<{ reply: string }> }>
  }
  const reply = doc.subjects[0]?.evals[0]?.reply ?? ''
  assert.match(reply, /boom; touch/)
  assert.equal(existsSync(sentinel), false)
})
