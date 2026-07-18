#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const REPOSITORY_ROOT = resolve(dirname(SCRIPT_PATH), '..')
const LAUNCH_SCRIPT = resolve(
  REPOSITORY_ROOT,
  'scripts/oauth-verification-launch.applescript',
)
const CHROME_SCRIPT = resolve(
  REPOSITORY_ROOT,
  'scripts/oauth-verification-chrome.applescript',
)
const NARRATION_SCRIPT = resolve(
  REPOSITORY_ROOT,
  'scripts/oauth-verification-narration.json',
)
const VOICEOVER_SCRIPT = resolve(
  REPOSITORY_ROOT,
  'scripts/oauth-verification-voiceover.py',
)
const SCROLL_SOURCE = resolve(
  REPOSITORY_ROOT,
  'scripts/oauth-verification-scroll.swift',
)
const SCROLL_BINARY = resolve(
  homedir(),
  'Library/Caches/seo/oauth-verification-scroll',
)
const DEFAULT_VOICEOVER_DIR = resolve(
  homedir(),
  'Library/Caches/seo/oauth-verification-voiceover',
)
const DEFAULT_TTS_MODEL = 'mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16'
const narrationScenes = JSON.parse(readFileSync(NARRATION_SCRIPT, 'utf8'))
const narrationById = new Map(narrationScenes.map((scene) => [scene.id, scene]))

const DEFAULTS = {
  cloudProject: 'seo-mcp-498117',
  oauthClientId:
    '548418788053-q7p964rqvjiv8ooamciprku6bpu34u9d.apps.googleusercontent.com',
  property: '123456789',
  project: 'oauth-verification-review',
  site: 'sc-domain:example.com',
  url: 'https://example.com',
}

function usage() {
  process.stdout.write(`Run the Google OAuth verification demo with the published seo command.

Usage:
  node scripts/oauth-verification-demo.mjs [options]

Options:
  --cloud-project <id>  Google Cloud project id (${DEFAULTS.cloudProject})
  --oauth-client-id <id> Desktop OAuth client id
  --property <id>       Google Analytics property id (${DEFAULTS.property})
  --project <id>        Temporary saved project id (${DEFAULTS.project})
  --site <property>     Search Console property (${DEFAULTS.site})
  --url <url>           Crawl URL (${DEFAULTS.url})
  --change-date <date>  Date used for the before and after report
  --launch              Open dedicated Ghostty and Chrome windows
  --automation-check    Check macOS Accessibility and Automation permissions
  --load-timeout <n>    Maximum seconds to wait for a Chrome tab to load (60)
  --record              Record the main display and add the narration tracks
  --record-output <file> Final movie path (Desktop by default)
  --generate-voiceover  Generate local Qwen3-TTS narration, then exit
  --voiceover           Play generated narration during the demo
  --voiceover-dir <dir> Narration cache (${DEFAULT_VOICEOVER_DIR})
  --tts-model <id>      MLX-Audio model (${DEFAULT_TTS_MODEL})
  --tts-speaker <name>  Qwen3-TTS CustomVoice speaker (Aiden)
  --skip-setup          Keep an existing project profile instead of recreating it
  --print               Print the scenes and commands without running them
  --help                Show this help

Use --launch for the recording. The runner creates dedicated Ghostty and Chrome
windows, plays optional local narration, and invokes the
globally installed seo package. Browser consent and account choices remain
manual so the recording clearly shows what the reviewer needs to inspect.
`)
}

function dateDaysAgo(days) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

function parseArgs(argv) {
  const options = {
    ...DEFAULTS,
    changeDate: dateDaysAgo(21),
    automationCheck: false,
    launch: false,
    loadTimeout: 60,
    generateVoiceover: false,
    print: false,
    record: false,
    recordOutput: resolve(
      homedir(),
      'Desktop',
      `seo-oauth-verification-${new Date().toISOString().slice(0, 10)}.mov`,
    ),
    session: false,
    skipSetup: false,
    ttsModel: DEFAULT_TTS_MODEL,
    ttsSpeaker: 'Aiden',
    voiceover: false,
    voiceoverDir: DEFAULT_VOICEOVER_DIR,
  }
  const keys = {
    '--cloud-project': 'cloudProject',
    '--oauth-client-id': 'oauthClientId',
    '--property': 'property',
    '--project': 'project',
    '--site': 'site',
    '--url': 'url',
    '--change-date': 'changeDate',
    '--load-timeout': 'loadTimeout',
    '--record-output': 'recordOutput',
    '--voiceover-dir': 'voiceoverDir',
    '--tts-model': 'ttsModel',
    '--tts-speaker': 'ttsSpeaker',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help') return { help: true }
    if (arg === '--print') {
      options.print = true
      continue
    }
    if (arg === '--launch') {
      options.launch = true
      continue
    }
    if (arg === '--automation-check') {
      options.automationCheck = true
      continue
    }
    if (arg === '--generate-voiceover') {
      options.generateVoiceover = true
      continue
    }
    if (arg === '--voiceover') {
      options.voiceover = true
      continue
    }
    if (arg === '--record') {
      options.record = true
      continue
    }
    if (arg === '--session') {
      options.session = true
      continue
    }
    if (arg === '--skip-setup') {
      options.skipSetup = true
      continue
    }
    const key = keys[arg]
    if (!key) throw new Error(`Unknown option: ${arg}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`${arg} requires a value.`)
    }
    options[key] = value
    index += 1
  }

  if (!/^\d+$/.test(options.property)) {
    throw new Error(
      '--property must be a numeric Google Analytics property id.',
    )
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.changeDate)) {
    throw new Error('--change-date must use YYYY-MM-DD.')
  }
  options.loadTimeout = Number(options.loadTimeout)
  if (
    !Number.isInteger(options.loadTimeout) ||
    options.loadTimeout < 10 ||
    options.loadTimeout > 180
  ) {
    throw new Error('--load-timeout must be a whole number from 10 to 180.')
  }
  options.recordOutput = resolve(options.recordOutput)
  if (options.record && !options.voiceover) {
    throw new Error('--record requires --voiceover.')
  }
  if (options.record && !options.launch && !options.session) {
    throw new Error('--record requires --launch.')
  }
  new URL(options.url)
  return options
}

function shellQuote(value) {
  return /^[A-Za-z0-9_./:=,-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", `'"'"'`)}'`
}

function commandText(command, args) {
  return [command, ...args].map(shellQuote).join(' ')
}

function runAppleScript(script, args, options = {}) {
  const result = spawnSync('osascript', [script, ...args], {
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = result.stderr?.trim()
    throw new Error(
      detail || `AppleScript stopped with exit code ${result.status}.`,
    )
  }
  return result.stdout?.trim() ?? ''
}

function automationReady() {
  if (process.platform !== 'darwin') {
    throw new Error('--launch requires macOS.')
  }
  const enabled = runAppleScript(CHROME_SCRIPT, ['check'], { capture: true })
  if (enabled !== 'true') {
    spawnSync('open', [
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
    ])
    throw new Error(
      'Ghostty needs Accessibility access to control the recording windows. Enable Ghostty in System Settings > Privacy & Security > Accessibility, then run this command again.',
    )
  }
}

function submittedAppUrls() {
  return {
    scopes: `https://console.cloud.google.com/auth/scopes?project=${encodeURIComponent(options.cloudProject)}`,
    branding: `https://console.cloud.google.com/auth/branding?project=${encodeURIComponent(options.cloudProject)}`,
    home: 'https://seoskill.dev',
  }
}

function preparedChromeUrls() {
  return Object.values(submittedAppUrls())
}

function launchGhosttySession() {
  automationReady()
  mkdirSync(dirname(SCROLL_BINARY), { recursive: true })
  const compileScrollHelper = spawnSync(
    'swiftc',
    [SCROLL_SOURCE, '-o', SCROLL_BINARY],
    { stdio: 'inherit' },
  )
  if (compileScrollHelper.error) throw compileScrollHelper.error
  if (compileScrollHelper.status !== 0) {
    throw new Error('Could not compile the browser scroll helper.')
  }
  process.stdout.write('Preparing a dedicated Chrome window...\n')
  runAppleScript(CHROME_SCRIPT, [
    'prepare',
    String(options.loadTimeout),
    ...preparedChromeUrls(),
  ])
  const sessionArgs = process.argv
    .slice(2)
    .filter((arg) => arg !== '--launch' && arg !== '--print')
  sessionArgs.push('--session')
  const command = commandText(process.execPath, [SCRIPT_PATH, ...sessionArgs])
  runAppleScript(LAUNCH_SCRIPT, [REPOSITORY_ROOT, command])
}

function generateVoiceover() {
  if (process.platform !== 'darwin') {
    throw new Error('Local MLX-Audio narration requires an Apple Silicon Mac.')
  }
  process.stdout.write(
    `Generating local narration in ${options.voiceoverDir}\nThe first run downloads the model and can take several minutes.\n\n`,
  )
  const result = spawnSync(
    'uv',
    [
      'run',
      '--no-project',
      '--python',
      '3.12',
      '--with',
      'mlx-audio',
      '--prerelease',
      'allow',
      VOICEOVER_SCRIPT,
      '--script',
      NARRATION_SCRIPT,
      '--output-dir',
      options.voiceoverDir,
      '--model',
      options.ttsModel,
      '--speaker',
      options.ttsSpeaker,
    ],
    { stdio: 'inherit' },
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `Voiceover generation stopped with exit code ${result.status}.`,
    )
  }
}

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  usage()
  process.exit(0)
}
if (options.generateVoiceover && !options.session) {
  generateVoiceover()
  process.exit(0)
}
if (options.automationCheck) {
  automationReady()
  process.stdout.write(
    'Ghostty can control Chrome and System Events. Window automation is ready.\n',
  )
  process.exit(0)
}
if (options.launch && !options.session && !options.print) {
  launchGhosttySession()
  process.exit(0)
}

const reader = createInterface({ input: stdin, output: stdout })
let sceneNumber = 0
let recorder
let recordingStartedAt
let recordingTempDirectory
let rawRecordingPath
const narrationEvents = []

if (options.session && !options.print) {
  spawnSync('seo', ['auth', 'logout'], {
    stdio: 'ignore',
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
  })
  await reader.question(
    `\nChrome and Ghostty are ready. Maximize both windows, then press Return to ${options.record ? 'start recording' : 'start'}. `,
  )
}

function recordedUi() {
  return options.session && options.voiceover
}

function clearTerminal() {
  process.stdout.write('\u001b[3J\u001b[2J\u001b[H')
}

async function startRecording() {
  if (!options.record || options.print) return
  mkdirSync(dirname(options.recordOutput), { recursive: true })
  recordingTempDirectory = mkdtempSync(
    join(tmpdir(), 'seo-oauth-verification-'),
  )
  rawRecordingPath = join(recordingTempDirectory, 'screen.mov')
  recordingStartedAt = Date.now()
  recorder = spawn(
    '/usr/sbin/screencapture',
    ['-v', '-D1', '-C', rawRecordingPath],
    { stdio: 'ignore' },
  )
  recorder.on('error', (error) => {
    process.stderr.write(`Screen recorder error: ${error.message}\n`)
  })
  await delay(2)
  if (recorder.exitCode !== null || recorder.signalCode !== null) {
    throw new Error('Screen recording stopped before the demo began.')
  }
}

async function stopRecording() {
  if (!recorder || !rawRecordingPath) return
  await delay(1)
  if (recorder.exitCode === null && recorder.signalCode === null) {
    const recorderExit = new Promise((resolveExit) => {
      recorder.once('exit', resolveExit)
    })
    recorder.kill('SIGINT')
    await recorderExit
  }

  if (narrationEvents.length === 0) {
    throw new Error('No narration events were recorded.')
  }
  const ffmpegArgs = ['-y', '-i', rawRecordingPath]
  for (const event of narrationEvents) ffmpegArgs.push('-i', event.audioPath)
  const delayedInputs = narrationEvents.map(
    (event, index) =>
      `[${index + 1}:a]adelay=${event.offsetMs}:all=1[a${index + 1}]`,
  )
  const mixedInputs = narrationEvents
    .map((_, index) => `[a${index + 1}]`)
    .join('')
  const filter = [
    ...delayedInputs,
    `${mixedInputs}amix=inputs=${narrationEvents.length}:duration=longest:normalize=0[mixed]`,
    '[mixed]apad[voiceover]',
  ].join(';')
  ffmpegArgs.push(
    '-filter_complex',
    filter,
    '-map',
    '0:v:0',
    '-map',
    '[voiceover]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    options.recordOutput,
  )
  const mux = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' })
  if (mux.error) throw mux.error
  if (mux.status !== 0) {
    throw new Error(`ffmpeg stopped with exit code ${mux.status}.`)
  }
  rmSync(recordingTempDirectory, { recursive: true, force: true })
  recorder = undefined
  recordingStartedAt = undefined
  process.stdout.write(`\nRecording saved to ${options.recordOutput}\n`)
}

function heading(title) {
  sceneNumber += 1
  if (recordedUi()) return
  process.stdout.write(
    `\n\nScene ${sceneNumber}: ${title}\n${'='.repeat(title.length + 9)}\n`,
  )
}

async function pause(message = 'Press Enter to continue.') {
  if (options.print || (options.session && options.voiceover)) return
  await reader.question(`\n${message} `)
}

function cue(id) {
  const scene = narrationById.get(id)
  if (!scene) throw new Error(`Unknown narration scene: ${id}`)
  if (options.voiceover && !options.print) return
  process.stdout.write(`\nNarration:\n${scene.text}\n`)
}

function playNarration(id) {
  if (!options.voiceover || options.print) return Promise.resolve()
  const scene = narrationById.get(id)
  if (!scene) throw new Error(`Unknown narration scene: ${id}`)
  const audioPath = resolve(options.voiceoverDir, scene.file)
  if (!existsSync(audioPath)) {
    throw new Error(
      `Missing narration clip: ${audioPath}\nRun node scripts/oauth-verification-demo.mjs --generate-voiceover first.`,
    )
  }
  if (recordingStartedAt) {
    narrationEvents.push({
      audioPath,
      offsetMs: Math.max(0, Date.now() - recordingStartedAt),
    })
  }
  return new Promise((resolvePlayback, rejectPlayback) => {
    const player = spawn('/usr/bin/afplay', [audioPath], { stdio: 'ignore' })
    player.on('error', rejectPlayback)
    player.on('exit', (code) => {
      if (code === 0) resolvePlayback()
      else rejectPlayback(new Error(`Narration playback stopped with ${code}.`))
    })
  })
}

function narrationDuration(id) {
  if (!options.voiceover || options.print) return 5
  const scene = narrationById.get(id)
  if (!scene) throw new Error(`Unknown narration scene: ${id}`)
  const audioPath = resolve(options.voiceoverDir, scene.file)
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ],
    { encoding: 'utf8' },
  )
  const duration = Number(probe.stdout?.trim())
  if (probe.status !== 0 || !Number.isFinite(duration)) {
    throw new Error(`Could not read narration duration: ${audioPath}`)
  }
  return duration
}

async function narrated(id, action) {
  cue(id)
  if (options.print) return
  const playback = playNarration(id)
  let actionError
  try {
    await action()
  } catch (error) {
    actionError = error
  }
  await playback
  if (actionError) throw actionError
}

function delay(seconds) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, seconds * 1000)
  })
}

function chromeAction(action, ...args) {
  if (!options.session || options.print) return
  runAppleScript(CHROME_SCRIPT, [action, ...args], { capture: true })
}

function pageAction(action, ...args) {
  if (!options.session || options.print) return
  const result = spawnSync(SCROLL_BINARY, [action, ...args], {
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Page action stopped with exit code ${result.status}.`)
  }
}

function focusTerminal() {
  chromeAction('focus-terminal')
}

async function run(command, args, text) {
  if (recordedUi()) {
    focusTerminal()
    clearTerminal()
    await delay(0.2)
  }
  process.stdout.write(`\n$ ${commandText(command, args)}\n`)
  if (options.print) return
  if (text && (!options.session || !options.voiceover)) await pause(text)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Command stopped with exit code ${result.status}.`)
  }
  focusTerminal()
}

async function runAndNarrate(
  id,
  command,
  args,
  text,
  { scrollPages = 0 } = {},
) {
  await run(command, args, text)
  if (scrollPages > 0 && recordedUi()) {
    chromeAction('terminal-action', 'scroll_to_top')
  }
  await narrated(id, async () => {
    for (let page = 0; page < scrollPages; page += 1) {
      await delay(2)
      chromeAction('terminal-action', 'scroll_page_down')
    }
    if (scrollPages === 0) await delay(1)
  })
}

async function runSetupAndNarrate(id, args, text) {
  if (recordedUi()) {
    focusTerminal()
    clearTerminal()
    await delay(0.2)
  }
  process.stdout.write(`\n$ ${commandText('seo', args)}\n`)
  if (options.print) {
    cue(id)
    return
  }
  if (text && (!options.session || !options.voiceover)) await pause(text)
  const child = spawn('seo', args, {
    stdio: 'inherit',
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
  })
  const childExit = waitForChild(child)
  for (const waitSeconds of [1.5, 1.25, 1.25]) {
    await delay(waitSeconds)
    if (child.exitCode !== null || child.signalCode !== null) break
    chromeAction('confirm-terminal')
  }
  const result = await childExit
  if (result.code !== 0) {
    throw new Error(
      `Command stopped with ${result.signal ?? `exit code ${result.code}`}.`,
    )
  }
  focusTerminal()
  await narrated(id, () => delay(1))
}

async function showPreparedPage(
  url,
  { reset = false, scrollBeforeSteps = 0 } = {},
) {
  if (!recordedUi()) process.stdout.write(`\nOpen: ${url}\n`)
  if (options.print) return
  if (!options.session) {
    spawnSync('open', [url], { stdio: 'inherit' })
    await pause('Prepare this page, then press Enter.')
    return
  }
  chromeAction('show', url, String(options.loadTimeout))
  if (reset) pageAction('home')
  if (scrollBeforeSteps > 0) {
    pageAction('scroll', 'down', String(scrollBeforeSteps), '90')
  }
  await delay(0.35)
}

async function showNarratedPage(
  id,
  url,
  { reset, scrollBeforeSteps, scrollAfterSeconds, scrollSteps = 12 } = {},
) {
  await showPreparedPage(url, { reset, scrollBeforeSteps })
  await narrated(id, async () => {
    if (scrollAfterSeconds !== undefined) {
      await delay(scrollAfterSeconds)
      pageAction('scroll', 'down', String(scrollSteps), '140')
    }
  })
}

function waitForChild(child) {
  return new Promise((resolveChild, rejectChild) => {
    child.on('error', rejectChild)
    child.on('exit', (code, signal) => resolveChild({ code, signal }))
  })
}

async function waitForChromeUrl(pattern, timeoutSeconds = 30) {
  if (!options.session || options.print) return
  const deadline = Date.now() + timeoutSeconds * 1000
  while (Date.now() < deadline) {
    const url = runAppleScript(CHROME_SCRIPT, ['active-url'], { capture: true })
    if (pattern.test(url)) return
    await delay(0.25)
  }
  throw new Error(`Chrome did not open ${pattern} within ${timeoutSeconds}s.`)
}

async function runOAuthLogin() {
  if (recordedUi()) {
    focusTerminal()
    clearTerminal()
    await delay(0.2)
  }
  const args = ['auth', 'login']
  process.stdout.write(`\n$ ${commandText('seo', args)}\n`)
  if (options.print) {
    cue('consent')
    return
  }
  if (!options.session || !options.voiceover) {
    await pause(
      'Run login, expand the complete permission list, and approve it.',
    )
  }
  const child = spawn('seo', args, {
    stdio: 'inherit',
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
  })
  const childExit = waitForChild(child)
  await waitForChromeUrl(/accounts\.google\.com/)
  await delay(0.75)
  await narrated('consent', () => childExit)
  const result = await childExit
  if (result.code !== 0) {
    throw new Error(
      `Google login stopped with ${result.signal ?? `exit code ${result.code}`}.`,
    )
  }
  focusTerminal()
}

try {
  if (recordedUi()) clearTerminal()
  await startRecording()

  heading('Check the production command')
  await run('seo', ['--version'], 'Run the version check.')
  await narrated('production', () => delay(1))

  const appUrls = submittedAppUrls()
  heading('Show every configured scope')
  await showNarratedPage('scopes', appUrls.scopes, {
    reset: true,
    scrollAfterSeconds: 1.5,
    scrollSteps: 12,
  })

  heading('Show the complete consent flow')
  await runOAuthLogin()
  await runAndNarrate(
    'account',
    'seo',
    ['auth', 'whoami'],
    'Show the connected Google account.',
  )

  heading('List accessible Analytics properties')
  await runAndNarrate(
    'properties',
    'seo',
    ['analytics', 'google', 'properties'],
    'Run property discovery.',
    { scrollPages: 1 },
  )

  if (!options.skipSetup) {
    heading('Match a web stream during setup')
    await runSetupAndNarrate(
      'streams',
      [
        'start',
        '--id',
        options.project,
        '--name',
        'Example Site',
        '--site',
        options.site,
        '--url',
        options.url,
        '--skip-mcp',
        '--skip-skill',
      ],
      'Run setup and match the site to its Analytics web stream.',
    )
  }

  heading('Run the main report')
  await runAndNarrate(
    'main-report',
    'seo',
    [
      'report',
      '--project',
      options.project,
      '--days',
      '28',
      '--limit',
      '2',
      '--crawl-max-pages',
      '1',
      '--crawl-max-depth',
      '1',
      '--json',
    ],
    'Run the bounded main report.',
    { scrollPages: 1 },
  )

  heading('Run a direct Analytics report')
  await runAndNarrate(
    'raw-report',
    'seo',
    [
      'analytics',
      'google',
      'report',
      '--property',
      options.property,
      '--start-date',
      '28daysAgo',
      '--end-date',
      'yesterday',
      '--dimensions',
      'landingPagePlusQueryString',
      '--metrics',
      'sessions,totalUsers,conversions',
      '--limit',
      '3',
      '--json',
    ],
    'Run the direct Data API report.',
    { scrollPages: 1 },
  )

  heading('Find measured AI referrals')
  await runAndNarrate(
    'ai-referrals',
    'seo',
    [
      'ai-referrals',
      '--property',
      options.property,
      '--start-date',
      '28daysAgo',
      '--end-date',
      'yesterday',
      '--max-rows',
      '100',
      '--result-limit',
      '3',
      '--json',
    ],
    'Run the AI referral report.',
    { scrollPages: 1 },
  )

  heading('Measure a before and after change')
  await runAndNarrate(
    'measurement',
    'seo',
    [
      'tests',
      'report',
      '--project',
      options.project,
      '--scope',
      'site',
      '--target',
      options.site,
      '--title',
      'Example Site Analytics review',
      '--date',
      options.changeDate,
      '--property',
      options.property,
      '--before',
      '3',
      '--after',
      '3',
      '--json',
    ],
    'Run the before and after report.',
    { scrollPages: 1 },
  )

  heading('Show the submitted app domains')
  await showNarratedPage('branding', appUrls.branding, {
    reset: true,
    scrollBeforeSteps: 14,
    scrollAfterSeconds: 2.5,
    scrollSteps: 12,
  })

  heading('State why the scope is the narrowest available')
  await narrated('scope', async () => {
    await delay(Math.max(0, narrationDuration('scope') - 3))
    await showPreparedPage(appUrls.home, { reset: true })
  })
  await stopRecording()
} finally {
  if (recorder) {
    try {
      await stopRecording()
    } catch (error) {
      process.stderr.write(`Could not finish recording: ${error.message}\n`)
    }
  }
  reader.close()
}
