-- Password-based authentication migration for existing JALSA accounts.
-- Existing users remain in place and can set a password through Forgot password.
ALTER TABLE users ADD COLUMN password_hash TEXT;

DROP INDEX IF EXISTS idx_verification_email_created;
ALTER TABLE verification_codes RENAME TO verification_codes_legacy;

CREATE TABLE verification_codes (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'reset')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Keep any still-pending registration codes. Old login OTP codes are no longer used.
INSERT INTO verification_codes (id, email, code_hash, purpose, attempts, created_at, expires_at)
SELECT id, email, code_hash, 'register', attempts, created_at, expires_at
FROM verification_codes_legacy
WHERE purpose = 'register';

DROP TABLE verification_codes_legacy;

CREATE INDEX idx_verification_email_created
  ON verification_codes(email, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
  failure_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT
);
