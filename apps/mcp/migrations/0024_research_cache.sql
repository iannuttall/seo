-- seo_research results kept for a day (src/research-store.ts), so the next
-- page of rows and a second ai_answers call for the same questions read the
-- paid result back instead of paying the provider again. key is a SHA-256
-- of the provider, its key and the request; value is the result, or the
-- AI answer tasks to read back. The Workers cache did this before, but it
-- is local to each data centre, so calls that landed elsewhere paid again.
-- Expired rows are deleted every hour.

CREATE TABLE research_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
