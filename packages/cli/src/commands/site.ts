import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, join, relative, resolve, sep } from 'node:path'
import {
  checkBuiltSite,
  SEO_VERSION,
  SeoError,
  type SiteCheckResult,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, negatedBooleanArg, stringArg } from '../args.js'
import { spawnCommand } from '../spawn.js'
import {
  printBulletSection,
  printCallout,
  printHeading,
  printJson,
  printKeyValue,
  printSection,
} from '../utils.js'
import { siteKitDirectory } from './skill-paths.js'

// The steps of `seo site guide`, in the order a site is built.
export const SITE_GUIDE_STEPS = [
  ['setup', 'Sign in to the accounts the site needs, one at a time'],
  ['market', 'Choose a market with real demand and data you can own'],
  ['data', 'Get, clean and keep the dataset'],
  ['plan', 'Plan the pages from what people search for'],
  ['build', 'Start the site and deploy a private preview'],
  ['golden-page', 'Build one page that is the best answer on the web'],
  ['writing', 'Write copy people enjoy and AI answers can quote'],
  ['scale', 'Turn the golden page into every page, with gates'],
  ['launch', 'Go live and get the important pages indexed'],
  ['grow', 'Measure with your own data and improve every week'],
] as const

type GuideStep = (typeof SITE_GUIDE_STEPS)[number][0]

const STARTER_SKIP = new Set(['node_modules', 'dist', '.astro', '.wrangler'])

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function titleFromFolder(folder: string): string {
  return slugify(basename(folder))
    .split('-')
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function domainArg(value: string | undefined): string {
  const domain = (value ?? 'example.com')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) {
    throw new SeoError(
      'INVALID_INPUT',
      `--domain must be a domain such as example.com, not ${value}.`,
    )
  }
  return domain
}

async function writeJson(
  path: string,
  edit: (data: Record<string, unknown>) => void,
) {
  const data = JSON.parse(await readFile(path, 'utf8')) as Record<
    string,
    unknown
  >
  edit(data)
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`)
}

function packageManager(): 'pnpm' | 'npm' {
  const probe = spawnCommand('pnpm', ['--version'], { stdio: 'ignore' })
  return probe.status === 0 ? 'pnpm' : 'npm'
}

const newCommand = defineCommand({
  meta: {
    name: 'new',
    description: 'Copy the Astro on Cloudflare starter into a new folder',
  },
  args: {
    folder: {
      type: 'positional',
      required: true,
      description: 'Folder to create. It must not exist or must be empty.',
    },
    name: {
      type: 'string',
      description: 'Site name. Defaults to the folder name.',
    },
    domain: {
      type: 'string',
      description:
        'Production domain. Defaults to example.com until you buy one.',
    },
    install: {
      type: 'boolean',
      default: true,
      description: 'Install packages after copying.',
      negativeDescription: 'Copy the files only.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const folder = resolve(String(args.folder))
    if (
      existsSync(folder) &&
      (await readdir(folder)).some((f) => f !== '.git')
    ) {
      throw new SeoError(
        'INVALID_INPUT',
        `${folder} is not empty. Choose a new folder for the site.`,
      )
    }
    const name = stringArg(args.name)?.trim() || titleFromFolder(folder)
    const domain = domainArg(stringArg(args.domain))
    const slug = slugify(basename(folder)) || 'site'
    const indexNowKey = randomBytes(16).toString('hex')

    const starter = join(siteKitDirectory(), 'starter')
    await cp(starter, folder, {
      recursive: true,
      filter: (source) =>
        !relative(starter, source)
          .split(sep)
          .some((part) => STARTER_SKIP.has(part)),
    })
    await rename(join(folder, 'gitignore'), join(folder, '.gitignore'))
    await writeJson(join(folder, 'site.config.json'), (config) => {
      config.name = name
      config.domain = domain
      config.indexNowKey = indexNowKey
    })
    await writeFile(join(folder, 'public', `${indexNowKey}.txt`), indexNowKey)
    await writeJson(join(folder, 'package.json'), (pkg) => {
      pkg.name = slug
      const dev = pkg.devDependencies as Record<string, string>
      dev.seo = `^${SEO_VERSION}`
    })
    const wranglerPath = join(folder, 'wrangler.jsonc')
    await writeFile(
      wranglerPath,
      (await readFile(wranglerPath, 'utf8')).replace(
        '"name": "example-site"',
        `"name": ${JSON.stringify(slug)}`,
      ),
    )
    const readmePath = join(folder, 'README.md')
    await writeFile(
      readmePath,
      (await readFile(readmePath, 'utf8')).replace(/^# .*$/m, `# ${name}`),
    )

    const shouldInstall = negatedBooleanArg(args, 'install') !== true
    const manager = shouldInstall ? packageManager() : undefined
    let installed = false
    if (manager) {
      if (!json)
        process.stdout.write(`Installing packages with ${manager}...\n`)
      const result = spawnCommand(manager, ['install'], {
        cwd: folder,
        stdio: json ? 'ignore' : 'inherit',
      })
      installed = result.status === 0
    }

    const next = [
      `cd ${relative(process.cwd(), folder) || '.'}`,
      'seo site guide setup',
    ]
    if (json) {
      printJson({
        folder,
        name,
        domain,
        installed,
        packageManager: manager ?? null,
        next,
      })
      return
    }
    printHeading(`Created ${name}`, folder)
    printKeyValue([
      ['Domain', domain],
      [
        'Packages',
        installed
          ? `installed with ${manager}`
          : manager
            ? `${manager} install failed. Run it in the folder.`
            : 'not installed',
      ],
    ])
    process.stdout.write('\n')
    printSection(
      'What is in it',
      'An example site about parks, built from src/data. It already passes `seo site check`: titles, canonicals, JSON-LD, sharing images, Markdown copies, llms.txt and sitemaps are done for every page.',
      'Later steps replace the example data and pages with yours.',
    )
    printCallout({
      title: 'Next',
      body: 'Read the first step. Each step ends with the next one.',
      command: next.join(' && '),
    })
  },
})

function guideStep(words: string[]): GuideStep | undefined {
  const wanted = slugify(words.join(' '))
  return SITE_GUIDE_STEPS.find(([step]) => step === wanted)?.[0]
}

const guideCommand = defineCommand({
  meta: {
    name: 'guide',
    description: 'Print the instructions for one step of building the site',
  },
  args: {
    step: {
      type: 'positional',
      required: false,
      description: SITE_GUIDE_STEPS.map(([step]) => step).join(', '),
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const words = (args._ as string[] | undefined)?.length
      ? (args._ as string[])
      : [stringArg(args.step) ?? '']
    if (!words.join('').trim()) {
      if (json) {
        printJson({
          steps: SITE_GUIDE_STEPS.map(([step, summary]) => ({ step, summary })),
        })
        return
      }
      printHeading(
        'Build a site, one step at a time',
        'Run `seo site guide <step>` and follow it before the next step.',
      )
      printBulletSection(
        'Steps',
        SITE_GUIDE_STEPS.map(([step, summary]) => `${step}: ${summary}`),
      )
      printCallout({ title: 'Start here', command: 'seo site guide setup' })
      return
    }
    const step = guideStep(words)
    if (!step) {
      throw new SeoError(
        'INVALID_INPUT',
        `Unknown step "${words.join(' ')}". Steps: ${SITE_GUIDE_STEPS.map(([s]) => s).join(', ')}.`,
      )
    }
    const markdown = await readFile(
      join(siteKitDirectory(), 'guide', `${step}.md`),
      'utf8',
    )
    const index = SITE_GUIDE_STEPS.findIndex(([s]) => s === step)
    const next = SITE_GUIDE_STEPS[index + 1]?.[0]
    if (json) {
      printJson({
        step,
        number: index + 1,
        of: SITE_GUIDE_STEPS.length,
        markdown,
        next: next ? `seo site guide ${next}` : null,
      })
      return
    }
    process.stdout.write(markdown.endsWith('\n') ? markdown : `${markdown}\n`)
  },
})

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'),
    )
}

function printCheck(result: SiteCheckResult): void {
  printHeading(
    result.status === 'passed'
      ? 'Site check passed'
      : result.status === 'partial'
        ? 'Site check stopped early'
        : 'Site check failed',
    result.origin,
  )
  printKeyValue([
    [
      'Pages',
      result.pagesChecked === result.pagesFound
        ? String(result.pagesFound)
        : `${result.pagesChecked} of ${result.pagesFound} checked`,
    ],
    ['Failures', String(result.failures)],
    ['Warnings', String(result.warnings)],
  ])
  process.stdout.write('\n')
  for (const rule of result.rules.slice(0, 40)) {
    const examples = result.issues
      .filter((issue) => issue.rule === rule.rule)
      .slice(0, 3)
      .map((issue) =>
        issue.found ? `${issue.file}: ${issue.found}` : issue.file,
      )
    printBulletSection(
      `${rule.level === 'fail' ? 'Fail' : 'Warn'} ${rule.rule} (${rule.group}, ${rule.count}). ${rule.fix}`,
      rule.count > examples.length
        ? [...examples, `and ${rule.count - examples.length} more`]
        : examples,
    )
  }
  if (result.rules.length > 40) {
    process.stdout.write(
      `${result.rules.length - 40} more rules failed. Use --json for all of them.\n\n`,
    )
  }
  if (result.status === 'partial') {
    printSection(
      'Not every page was checked',
      `The check stops at ${result.pagesChecked} pages, so it cannot say the rest pass. Split the site or build fewer, stronger pages.`,
    )
  }
  printCallout(
    result.status === 'passed'
      ? {
          title: 'Next',
          body: 'Deploy the build, or read the next step of the guide.',
          command: 'seo site guide',
        }
      : {
          title: 'Next',
          body: 'Fix the template or the data behind the first rule, then build again.',
          command: 'pnpm build',
        },
  )
}

const checkCommand = defineCommand({
  meta: {
    name: 'check',
    description: 'Check the built site and fail on any rule it breaks',
  },
  args: {
    dir: {
      type: 'string',
      description:
        'Site folder with site.config.json. Defaults to this folder.',
    },
    dist: {
      type: 'string',
      description: 'Build folder. Defaults to dist inside the site folder.',
    },
    domain: {
      type: 'string',
      description:
        'Production domain. Defaults to the one in site.config.json.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const dir = resolve(stringArg(args.dir) ?? '.')
    const dist = resolve(dir, stringArg(args.dist) ?? 'dist')
    const configPath = join(dir, 'site.config.json')
    const config = existsSync(configPath)
      ? (JSON.parse(await readFile(configPath, 'utf8')) as {
          domain?: string
          allowWords?: string[]
        })
      : {}
    const domain = stringArg(args.domain) ?? config.domain
    if (!domain) {
      throw new SeoError(
        'INVALID_INPUT',
        'No domain. Run this in a folder made by `seo site new`, or pass --domain.',
      )
    }
    if (!existsSync(dist)) {
      throw new SeoError(
        'INVALID_INPUT',
        `${dist} does not exist. Build the site first with \`pnpm build\`.`,
      )
    }
    const result = await checkBuiltSite({
      origin: `https://${domainArg(domain)}`,
      files: await listFiles(dist),
      readText: (path) => readFile(join(dist, path), 'utf8'),
      readBytes: (path) => readFile(join(dist, path)),
      allowWords: config.allowWords ?? [],
      sources: existsSync(join(dir, 'src'))
        ? {
            files: (await listFiles(join(dir, 'src'))).map(
              (file) => `src/${file}`,
            ),
            readText: (path) => readFile(join(dir, path), 'utf8'),
          }
        : undefined,
    })
    if (json) printJson(result)
    else printCheck(result)
    if (result.status !== 'passed') process.exitCode = 1
  },
})

export const siteCommand = defineCommand({
  meta: {
    name: 'site',
    description: 'Build a data-driven site on Astro and Cloudflare',
  },
  subCommands: {
    new: newCommand,
    guide: guideCommand,
    check: checkCommand,
  },
})
