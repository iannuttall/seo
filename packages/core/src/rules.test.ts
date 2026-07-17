import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AUDIT_PAGE_RULE_IDS } from './analyze/audit-page.js'
import { explainRule, listRules } from './rules.js'

test('rule registry has unique ids and complete guidance', () => {
  const rules = listRules()
  const ids = new Set<string>()

  assert.equal(rules.length, 51)
  for (const rule of rules) {
    assert.equal(ids.has(rule.id), false, `duplicate rule id: ${rule.id}`)
    ids.add(rule.id)
    assert.ok(rule.title.trim(), `${rule.id} is missing a title`)
    assert.ok(rule.whyItMatters.trim(), `${rule.id} is missing whyItMatters`)
    assert.ok(rule.howToFix.trim(), `${rule.id} is missing howToFix`)
    assert.ok(
      rule.impactIfIgnored.trim(),
      `${rule.id} is missing impactIfIgnored`,
    )
    assert.ok(rule.howToVerify.trim(), `${rule.id} is missing howToVerify`)
  }
})

test('page audit issue codes are backed by rule guidance', () => {
  for (const ruleId of AUDIT_PAGE_RULE_IDS) {
    assert.ok(explainRule(ruleId), `${ruleId} has no rule guidance`)
  }
})

test('rule guidance marks observations that need confirmation', () => {
  assert.equal(explainRule('hsts_missing')?.recommendation, 'review')
  assert.equal(explainRule('twitter_card_missing')?.recommendation, 'review')
  assert.equal(explainRule('missing_title')?.recommendation, 'fix')
})
