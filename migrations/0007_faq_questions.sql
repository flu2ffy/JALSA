-- JALSA FAQ visitor questions and admin inbox.
-- The Worker also creates this table defensively on first use for preview environments.
CREATE TABLE IF NOT EXISTS faq_questions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_faq_questions_created ON faq_questions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_faq_questions_status ON faq_questions(status, created_at DESC);

INSERT INTO d1_migrations (name) VALUES ('0007_faq_questions.sql');
