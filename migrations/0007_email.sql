-- Email verification and password reset.
ALTER TABLE users ADD COLUMN email_verified_at INTEGER;

-- Single-use links sent by email. Only a hash of the token is stored.
CREATE TABLE email_tokens (
	token_hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	purpose TEXT NOT NULL,            -- verify | reset
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	used_at INTEGER
);
CREATE INDEX email_tokens_user ON email_tokens(user_id, purpose, created_at);
