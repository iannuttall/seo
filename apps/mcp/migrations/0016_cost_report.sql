-- SEO Skill's own costs, for the weekly cost report and its alerts to
-- Telegram (src/cost-report.ts).
--
-- dataforseo_days: the first reading of SEO Skill's DataForSEO account each
-- UTC day, taken by the hourly cron. DataForSEO reports only today's spend,
-- so the weekly report subtracts an older reading's lifetime spend from
-- today's. spent is money deposited less balance, and balance is what is
-- left, both in US dollars as DataForSEO reported them; read_at is when
-- (ms). Rows older than 60 days are removed.
--
-- cost_alerts: one row per alert kind ('dataforseo_balance', 'cloudflare')
-- and UTC day, claimed before the alert is sent so it goes once a day, and
-- removed again when Telegram fails so the next hour tries again. Rows
-- older than 60 days are removed.

CREATE TABLE dataforseo_days (
  day TEXT PRIMARY KEY,
  read_at INTEGER NOT NULL,
  spent REAL NOT NULL,
  balance REAL NOT NULL
);

CREATE TABLE cost_alerts (
  kind TEXT NOT NULL,
  day TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (kind, day)
);
