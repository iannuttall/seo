-- Alerts for beta accounts (src/alerts): what each person wants, and the
-- alerts waiting to go or sent in the last 30 days.

-- prefs is JSON {type: {email: bool, webhook: bool}}; a type or channel not
-- in it uses the type's default (src/alerts/registry.ts). The webhook
-- secret is sealed with SEAL_KEY.
CREATE TABLE alert_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs TEXT NOT NULL DEFAULT '{}',
  webhook_url TEXT,
  webhook_secret TEXT,
  -- The last webhook delivery: when, and "ok" or the error.
  webhook_last_at INTEGER,
  webhook_last TEXT,
  updated_at INTEGER NOT NULL
);

-- One alert: one site's changes from one run of a background job. Each
-- channel is pending, sent, off, held (the day's email limit), or failed.
-- next_at is when to try again; null once nothing is left to send.
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  site TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  data TEXT NOT NULL,
  email TEXT NOT NULL,
  email_attempts INTEGER NOT NULL DEFAULT 0,
  email_error TEXT,
  held_on TEXT,
  webhook TEXT NOT NULL,
  webhook_attempts INTEGER NOT NULL DEFAULT 0,
  webhook_error TEXT,
  next_at INTEGER
);
CREATE INDEX alerts_due ON alerts(next_at) WHERE next_at IS NOT NULL;
CREATE INDEX alerts_user ON alerts(user_id, created_at);

-- Alert emails sent and held back per UTC day, under the sending
-- cluster's daily limit.
CREATE TABLE alert_email_days (
  day TEXT PRIMARY KEY,
  sent INTEGER NOT NULL DEFAULT 0,
  held INTEGER NOT NULL DEFAULT 0
);
