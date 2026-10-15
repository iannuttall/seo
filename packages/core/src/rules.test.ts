import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AUDIT_PAGE_RULE_IDS } from './analyze/audit-page.js'
import { explainRule } from './rules.js'

test('page audit issue codes are backed by rule guidance', () => {
  for (const ruleId of AUDIT_PAGE_RULE_IDS) {
    assert.ok(explainRule(ruleId), `${ruleId} has no rule guidance`)
  }
})
