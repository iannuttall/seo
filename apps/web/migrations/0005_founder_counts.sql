-- The last good follower count for each network the daily cron reads for
-- the founder badge and the About page, and when it was read. A row is
-- replaced only by a count that looks real (worker/founder.ts). LinkedIn
-- has no public count, so it stays in src/lib/site.ts.
CREATE TABLE founder_counts (
  network TEXT PRIMARY KEY CHECK (network IN ('x', 'youtube')),
  count INTEGER NOT NULL CHECK (count > 0),
  checked_at TEXT NOT NULL
) STRICT;
