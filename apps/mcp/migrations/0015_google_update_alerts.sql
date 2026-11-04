-- Google ranking update alerts sent, one row per update, phase (started or
-- finished) and account, claimed before the alert is queued so no account
-- gets the same one twice. Rows older than 90 days are removed.

CREATE TABLE google_update_alerts (
  update_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (update_id, phase, user_id)
);
