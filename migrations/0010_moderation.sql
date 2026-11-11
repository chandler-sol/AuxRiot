-- Moderation: moderator role, suspensions, held comments, voided battles, and an audit log.
ALTER TABLE users ADD COLUMN is_mod INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN suspended_at INTEGER;
ALTER TABLE users ADD COLUMN suspended_reason TEXT;

-- 1 = caught by the blocked-words filter; only the author sees it until a moderator approves it.
ALTER TABLE comments ADD COLUMN held INTEGER NOT NULL DEFAULT 0;

CREATE TABLE mod_log (
	id TEXT PRIMARY KEY,
	actor_id TEXT NOT NULL REFERENCES users(id),
	action TEXT NOT NULL,             -- e.g. battle.end_voting, vote.discount, comment.hide, user.suspend
	target_type TEXT NOT NULL,        -- battle | entry | vote | comment | user | report | settings | credits | news | promo
	target_id TEXT NOT NULL DEFAULT '',
	details TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL
);
CREATE INDEX mod_log_time ON mod_log(created_at);
CREATE INDEX mod_log_target ON mod_log(target_type, target_id);

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('blocked_words', '', 0);
