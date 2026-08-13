import {
  AI_PROMPT_OBSERVATION_SCHEMA_SQL,
  aiPromptObservationsTableSql,
} from '../ai-prompt-observations/schema.js'
import {
  KEYWORD_SET_SCHEMA_SQL,
  keywordSetItemsTableSql,
  keywordSetsTableSql,
} from '../keyword-sets/schema.js'
import {
  RANK_TRACKING_SCHEMA_SQL,
  rankTrackingConfigsTableSql,
  rankTrackingSnapshotsTableSql,
} from '../rank-tracking/schema.js'
import type Database from './sqlite.js'

const PROVIDER_TABLES = [
  'keyword_sets',
  'keyword_set_items',
  'rank_tracking_configs',
  'rank_tracking_snapshots',
  'ai_prompt_observations',
] as const

function tableSql(database: Database.Database, table: string): string {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { sql?: string } | undefined
  return row?.sql ?? ''
}

export function migrateProviderIds(database: Database.Database): boolean {
  const needsMigration = PROVIDER_TABLES.some((table) => {
    const sql = tableSql(database, table)
    return /(?:provider|metric_provider)\s+TEXT[^,]*CHECK\(/u.test(sql)
  })
  if (!needsMigration) return false

  database.pragma('foreign_keys = OFF')
  database.pragma('legacy_alter_table = ON')
  try {
    const migrate = database.transaction(() => {
      database.exec(`
${keywordSetsTableSql('keyword_sets_serpbase_next', false)}
INSERT INTO keyword_sets_serpbase_next SELECT * FROM keyword_sets;

${keywordSetItemsTableSql('keyword_set_items_serpbase_next', false)}
INSERT INTO keyword_set_items_serpbase_next SELECT * FROM keyword_set_items;

${rankTrackingConfigsTableSql('rank_tracking_configs_serpbase_next', false)}
INSERT INTO rank_tracking_configs_serpbase_next SELECT * FROM rank_tracking_configs;

${rankTrackingSnapshotsTableSql('rank_tracking_snapshots_serpbase_next', false)}
INSERT INTO rank_tracking_snapshots_serpbase_next SELECT * FROM rank_tracking_snapshots;

${aiPromptObservationsTableSql('ai_prompt_observations_serpbase_next', false)}
INSERT INTO ai_prompt_observations_serpbase_next SELECT * FROM ai_prompt_observations;

DROP TABLE rank_tracking_snapshots;
DROP TABLE rank_tracking_configs;
DROP TABLE keyword_set_items;
DROP TABLE keyword_sets;
DROP TABLE ai_prompt_observations;

ALTER TABLE keyword_sets_serpbase_next RENAME TO keyword_sets;
ALTER TABLE keyword_set_items_serpbase_next RENAME TO keyword_set_items;
ALTER TABLE rank_tracking_configs_serpbase_next RENAME TO rank_tracking_configs;
ALTER TABLE rank_tracking_snapshots_serpbase_next RENAME TO rank_tracking_snapshots;
ALTER TABLE ai_prompt_observations_serpbase_next RENAME TO ai_prompt_observations;
`)
      database.exec(KEYWORD_SET_SCHEMA_SQL)
      database.exec(RANK_TRACKING_SCHEMA_SQL)
      database.exec(AI_PROMPT_OBSERVATION_SCHEMA_SQL)
      const violations = database.pragma('foreign_key_check') as unknown[]
      if (violations.length > 0) {
        throw new Error('Provider id migration found invalid foreign keys.')
      }
    })
    migrate.immediate()
    return true
  } finally {
    database.pragma('legacy_alter_table = OFF')
    database.pragma('foreign_keys = ON')
  }
}

export const migrateSerpBaseProviderIds = migrateProviderIds
