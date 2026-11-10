-- AuxRiot news (marketing) opt-in, and a log of broadcasts sent from the admin composer.
ALTER TABLE users ADD COLUMN news_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN news_opt_in_at INTEGER;
-- 1 once this user's contact exists in Resend's "AuxRiot news" segment.
ALTER TABLE users ADD COLUMN news_synced INTEGER NOT NULL DEFAULT 0;

CREATE TABLE news_sends (
	id TEXT PRIMARY KEY,
	resend_broadcast_id TEXT,
	template TEXT NOT NULL,
	subject TEXT NOT NULL,
	draft_json TEXT NOT NULL,
	sent_by TEXT NOT NULL REFERENCES users(id),
	recipients INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);
