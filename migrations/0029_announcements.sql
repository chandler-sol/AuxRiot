-- On-site announcement pop-ups. One shows at a time (newest active first); once someone
-- dismisses an announcement it never shows to them again.
CREATE TABLE announcements (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	body TEXT NOT NULL,                 -- short text; blank lines make paragraphs
	button_label TEXT,                  -- optional call to action
	button_url TEXT,
	audience TEXT NOT NULL DEFAULT 'all',   -- all | signed_in | signed_out
	active INTEGER NOT NULL DEFAULT 0,
	starts_at INTEGER,                  -- optional window
	ends_at INTEGER,
	created_by TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE INDEX announcements_live ON announcements(active, created_at);

CREATE TABLE announcement_dismissals (
	announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id),
	dismissed_at INTEGER NOT NULL,
	PRIMARY KEY (announcement_id, user_id)
);
