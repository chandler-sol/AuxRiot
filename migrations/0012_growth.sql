-- Battle notification emails, open-battle reminders, auth rate limiting, OAuth sign-up.
ALTER TABLE users ADD COLUMN notify_battles INTEGER NOT NULL DEFAULT 1;
ALTER TABLE battles ADD COLUMN reminded_at INTEGER;

-- One row per login/signup/reset attempt, keyed by a salted IP hash. Old rows are pruned.
CREATE TABLE auth_attempts (
	ip_hash TEXT NOT NULL,
	kind TEXT NOT NULL,            -- login_fail | signup | forgot
	created_at INTEGER NOT NULL
);
CREATE INDEX auth_attempts_lookup ON auth_attempts(ip_hash, kind, created_at);

-- OAuth sign-ups waiting for the person to pick a username.
CREATE TABLE oauth_pending (
	token_hash TEXT PRIMARY KEY,
	provider TEXT NOT NULL,
	provider_user_id TEXT NOT NULL,
	email TEXT,
	email_verified INTEGER NOT NULL DEFAULT 0,
	suggested TEXT,
	avatar_url TEXT,
	created_at INTEGER NOT NULL
);
