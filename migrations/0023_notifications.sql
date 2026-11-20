-- In-app notifications (the bell). Text and link are written when the event happens,
-- so old notifications still read correctly after titles or names change.
CREATE TABLE notifications (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind TEXT NOT NULL,              -- e.g. battle_answered, mention, beat_sold (see src/lib/server/notifications.ts)
	text TEXT NOT NULL,
	url TEXT NOT NULL,
	actor_id TEXT,                   -- who caused it, if a person did (no FK: they may be deleted)
	group_key TEXT,                  -- unread notifications with the same key merge ("5 new comments")
	count INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL,
	read_at INTEGER
);
CREATE INDEX notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE UNIQUE INDEX notifications_group ON notifications(user_id, group_key) WHERE read_at IS NULL AND group_key IS NOT NULL;

-- Email when someone @mentions you (throttled per battle). On by default.
ALTER TABLE users ADD COLUMN notify_mentions INTEGER NOT NULL DEFAULT 1;
