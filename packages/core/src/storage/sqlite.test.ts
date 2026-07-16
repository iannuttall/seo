import assert from 'node:assert/strict'
import { test } from 'node:test'
import Database from './sqlite.js'

test('SQLite rows do not expose driver metadata', () => {
  const database = new Database(':memory:')
  database.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)')
  database.prepare('INSERT INTO items (name) VALUES (?)').run('first')

  assert.deepEqual(database.prepare('SELECT * FROM items').get(), {
    id: 1,
    name: 'first',
  })
  assert.deepEqual(database.prepare('SELECT * FROM items').all(), [
    { id: 1, name: 'first' },
  ])
  database.close()
})
