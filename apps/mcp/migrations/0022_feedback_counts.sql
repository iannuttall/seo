-- How many seo_feedback reports each sender sent today, to cap them
-- (src/feedback.ts). sender is a SHA-256 of the account id or IP address
-- with the day, so a row names no one and cannot be joined across days.
-- '*' counts every sender. Rows from earlier days are deleted on the next
-- report. The reports themselves are forwarded, not kept.

CREATE TABLE feedback_counts (
  day TEXT NOT NULL,
  sender TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, sender)
);
