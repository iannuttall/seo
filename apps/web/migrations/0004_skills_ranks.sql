-- One row per day and skills.sh leaderboard ('all-time' or 'trending'):
-- where iannuttall/seo stands (1 = first, NULL = not in the pages checked),
-- how many pages of 200 were checked, and how many skills the board lists.
CREATE TABLE skills_ranks (
  day TEXT NOT NULL
    CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  board TEXT NOT NULL CHECK (board IN ('all-time', 'trending')),
  rank INTEGER CHECK (rank IS NULL OR rank >= 1),
  checked INTEGER NOT NULL CHECK (checked >= 0),
  total INTEGER CHECK (total IS NULL OR total >= 0),
  PRIMARY KEY (day, board)
) STRICT;
