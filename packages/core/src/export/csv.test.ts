import assert from 'node:assert/strict'
import test from 'node:test'
import { renderCsv } from './csv.js'

test('renderCsv escapes commas, quotes, and newlines', () => {
  const csv = renderCsv([
    {
      query: 'best seo tools',
      note: 'Needs "client ready", not vague',
      action: 'Export CSV\nSend to client',
    },
  ])

  assert.equal(
    csv,
    'query,note,action\nbest seo tools,"Needs ""client ready"", not vague","Export CSV\nSend to client"\n',
  )
})
