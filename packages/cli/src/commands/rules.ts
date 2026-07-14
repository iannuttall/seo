import { explainRule, listRules } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../args.js'
import {
  printCatalog,
  printJson,
  printKeyValue,
  printSection,
} from '../utils.js'

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
    process.stdout.write('\n')
    printSection('Why it matters', rule.whyItMatters)
    process.stdout.write('\n')
    printSection('How to fix', rule.howToFix)
    process.stdout.write('\n')
    printSection('Impact if ignored', rule.impactIfIgnored)
    process.stdout.write('\n')
    printSection('How to verify', rule.howToVerify)
  },
})
