import { spawnSync } from 'node:child_process'

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  })
}

function hasCommand(command) {
  const result = spawnSync('command', ['-v', command], {
    shell: true,
    stdio: 'ignore',
  })
  return result.status === 0
}

if (!hasCommand('gitleaks')) {
  if (process.platform === 'darwin' && hasCommand('brew')) {
    process.stdout.write('gitleaks not found. Installing with Homebrew...\n')
    const install = run('brew', ['install', 'gitleaks'])
    if (install.status !== 0) process.exit(install.status ?? 1)
  } else {
    process.stderr.write(
      'gitleaks is required. Install it from https://github.com/gitleaks/gitleaks and rerun this command.\n',
    )
    process.exit(1)
  }
}

const scan = run('gitleaks', [
  'detect',
  '--source',
  '.',
  '--redact',
  '--no-banner',
  '--verbose',
])

process.exit(scan.status ?? 1)
