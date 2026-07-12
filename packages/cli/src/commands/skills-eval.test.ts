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
import {
  assembleAgentPrompt,
  buildArgv,
  buildJudgePrompt,
  extractJsonObject,
  loadEvalFile,
  parseJudgeVerdicts,
  tokenizeCommand,
} from './skills-eval.js'

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

test('tokenizeCommand splits argv and respects quotes', () => {
  assert.deepEqual(tokenizeCommand('claude -p'), ['claude', '-p'])
  assert.deepEqual(tokenizeCommand('node "with space" {prompt}'), [
    'node',
    'with space',
    '{prompt}',
  ])
  assert.deepEqual(tokenizeCommand("run 'single quoted arg'"), [
    'run',
    'single quoted arg',
  ])
  assert.throws(() => tokenizeCommand('bad "unbalanced'), /Unbalanced quote/)
})

test('buildArgv keeps a substituted prompt as one argv token', () => {
  const nasty = 'hello; rm -rf / && echo "$(whoami)" | cat'
  const { argv, usesPlaceholder } = buildArgv('node run.js {prompt}', nasty)
  assert.equal(usesPlaceholder, true)
  assert.deepEqual(argv, ['node', 'run.js', nasty])

  const stdinCase = buildArgv('claude -p', nasty)
  assert.equal(stdinCase.usesPlaceholder, false)
  assert.deepEqual(stdinCase.argv, ['claude', '-p'])
})

test('assembleAgentPrompt includes or omits the skill body', () => {
  const withSkill = assembleAgentPrompt('SKILL BODY', 'do a thing')
  assert.match(withSkill, /SKILL BODY/)
  assert.match(withSkill, /do a thing/)
  assert.equal(assembleAgentPrompt(null, 'do a thing'), 'do a thing')
})

test('extractJsonObject pulls the first object out of noisy text', () => {
  const fenced = 'Here you go:\n```json\n{"results":[]}\n```\nthanks'
  assert.deepEqual(extractJsonObject(fenced), { results: [] })
  assert.equal(extractJsonObject('no json here'), undefined)
  assert.equal(extractJsonObject('{ broken'), undefined)
})

test('parseJudgeVerdicts maps results and flags a wrong count', () => {
  const assertions = ['one', 'two']
  const good = parseJudgeVerdicts(
    JSON.stringify({
      results: [
        { pass: true, reason: 'yes' },
        { pass: false, reason: 'no' },
      ],
    }),
    assertions,
  )
  assert.ok('verdicts' in good)
  if ('verdicts' in good) {
    assert.equal(good.verdicts[0]?.verdict, 'pass')
    assert.equal(good.verdicts[1]?.verdict, 'fail')
    assert.equal(good.verdicts[0]?.source, 'judge verdict')
  }
  const wrong = parseJudgeVerdicts(
    JSON.stringify({ results: [{ pass: true }] }),
    assertions,
  )
  assert.ok('error' in wrong)
})

test('buildJudgePrompt lists assertions and demands strict JSON', () => {
  const prompt = buildJudgePrompt('req', 'reply', ['a', 'b'])
  assert.match(prompt, /<assertions>/)
  assert.match(prompt, /STRICT JSON only/)
  assert.match(prompt, /exactly 2 results/)
})

test('loadEvalFile rejects malformed eval files', () => {
  const bad = join(evalsDir, 'broken.json')
  const write = (doc: unknown) => writeFileSync(bad, JSON.stringify(doc))

  write({ subject: 'nope', evals: [] })
  assert.throws(() => loadEvalFile('broken', bad), /subject/)

  write({ subject: 'broken', evals: [] })
  assert.throws(() => loadEvalFile('broken', bad), /non-empty evals/)

  write({
    subject: 'broken',
    evals: [
      { id: 1, prompt: 'p', expected_output: 'e', assertions: ['a'] },
      { id: 1, prompt: 'p', expected_output: 'e', assertions: ['a'] },
    ],
  })
  assert.throws(() => loadEvalFile('broken', bad), /duplicate id/)

  write({
    subject: 'broken',
    evals: [{ id: 1, prompt: '', expected_output: 'e', assertions: ['a'] }],
  })
  assert.throws(() => loadEvalFile('broken', bad), /prompt/)

  write({
    subject: 'broken',
    evals: [{ id: 1, prompt: 'p', expected_output: 'e', assertions: [] }],
  })
  assert.throws(() => loadEvalFile('broken', bad), /assertions/)

  rmSync(bad, { force: true })
})

test('--list reports subjects with eval counts as json', async () => {
  const result = await runEval(['skill', 'eval', '--list', '--json'])
  assert.equal(result.exitCode, 0)
  const doc = JSON.parse(result.stdout) as {
    schemaVersion: number
    subjects: Array<{ subject: string; evals: number }>
  }
  assert.equal(doc.schemaVersion, 1)
  const demo = doc.subjects.find((entry) => entry.subject === 'demo')
  assert.equal(demo?.evals, 2)
})

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

test('--no-skill omits the router body from the agent prompt', async () => {
  const result = await runEval([
    'skill',
    'eval',
    'other',
    '--agent',
    agentTemplate,
    '--no-skill',
    '--no-judge',
    '--json',
  ])
  assert.equal(result.exitCode, 0)
  const doc = JSON.parse(result.stdout) as {
    skillContext: boolean
    subjects: Array<{ evals: Array<{ reply: string; status: string }> }>
  }
  assert.equal(doc.skillContext, false)
  const reply = doc.subjects[0]?.evals[0]?.reply ?? ''
  assert.doesNotMatch(reply, /ROUTER BODY MARKER/)
  assert.match(reply, /Other prompt/)
  assert.equal(doc.subjects[0]?.evals[0]?.status, 'unjudged')
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

test('malformed judge output retries once then parses', async () => {
  const stateFile = join(workspace, 'judge-state')
  rmSync(stateFile, { force: true })
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
    { SEO_TEST_JUDGE: 'malformed_then_valid', SEO_TEST_STATE: stateFile },
  )
  assert.equal(result.exitCode, 0)
  const doc = JSON.parse(result.stdout) as {
    subjects: Array<{ evals: Array<{ status: string }> }>
  }
  assert.equal(doc.subjects[0]?.evals[0]?.status, 'passed')
})

test('a wrong-count judge marks the eval errored and exits 1', async () => {
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
    { SEO_TEST_JUDGE: 'wrongcount' },
  )
  assert.equal(result.exitCode, 1)
  const doc = JSON.parse(result.stdout) as {
    totals: { errored: number }
    subjects: Array<{ evals: Array<{ status: string; error?: string }> }>
  }
  assert.equal(doc.totals.errored, 1)
  assert.equal(doc.subjects[0]?.evals[0]?.status, 'errored')
})

test('--id runs a single eval within one subject', async () => {
  const result = await runEval([
    'skill',
    'eval',
    'demo',
    '--id',
    '2',
    '--agent',
    agentTemplate,
    '--judge-agent',
    judgeTemplate,
    '--json',
  ])
  assert.equal(result.exitCode, 0)
  const doc = JSON.parse(result.stdout) as {
    subjects: Array<{ evals: Array<{ id: number }> }>
  }
  assert.equal(doc.subjects[0]?.evals.length, 1)
  assert.equal(doc.subjects[0]?.evals[0]?.id, 2)
})

test('--id with more than one subject fails', async () => {
  const result = await runEval([
    'skill',
    'eval',
    'demo',
    'other',
    '--id',
    '1',
    '--agent',
    agentTemplate,
  ])
  assert.notEqual(result.exitCode, 0)
  assert.match(result.stderr, /--id needs exactly one subject/)
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

test('an unknown subject fails clearly', async () => {
  const result = await runEval([
    'skill',
    'eval',
    'does-not-exist',
    '--agent',
    agentTemplate,
  ])
  assert.notEqual(result.exitCode, 0)
  assert.match(result.stderr, /Unknown eval subject/)
})
