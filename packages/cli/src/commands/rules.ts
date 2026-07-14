import { explainRule, listRules } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../args.js'
import { printCatalog, printJson, printKeyValue } from '../utils.js'

export const rulesCommand = defineCommand({
  meta: {
    name: 'rules',
    description: 'List crawler rule ids and default guidance',
  },
  args: {
    category: {
      type: 'string',
      description: 'Filter rules by category.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const category = stringArg(args.category)
    const rules = listRules().filter((rule) =>
      category ? rule.category === category : true,
    )

    if (jsonFlag(args)) {
      printJson({ rules })
      return
    }

    printCatalog(
      rules.map((rule) => ({
        id: rule.id,
        category: rule.category,
        name: `${rule.title} · ${rule.defaultSeverity}`,
      })),
      { noun: 'rule' },
    )
  },
})

export const explainCommand = defineCommand({
  meta: {
    name: 'explain',
    description: 'Explain one crawler rule in plain English',
  },
  args: {
    rule: {
      type: 'string',
      required: true,
      description: 'Rule id to explain, for example missing_title.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const ruleId = stringArg(args.rule) ?? ''
    const rule = explainRule(ruleId)
    if (!rule) {
      throw new Error(`Unknown rule: ${ruleId}`)
    }

    if (jsonFlag(args)) {
      printJson(rule)
      return
    }

    printKeyValue([
      ['Rule', rule.id],
      ['Title', rule.title],
      ['Category', rule.category],
      ['Severity', rule.defaultSeverity],
    ])
    process.stdout.write(`\nWhy it matters\n${rule.whyItMatters}\n`)
    process.stdout.write(`\nHow to fix\n${rule.howToFix}\n`)
    process.stdout.write(`\nImpact if ignored\n${rule.impactIfIgnored}\n`)
    process.stdout.write(`\nHow to verify\n${rule.howToVerify}\n`)
  },
})
