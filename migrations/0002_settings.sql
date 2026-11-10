-- Site-wide settings that admins can change at runtime (no redeploy).
CREATE TABLE settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	updated_by TEXT
);

-- Launch period: new accounts can vote after 24 hours.
INSERT INTO settings (key, value, updated_at) VALUES ('voter_min_age_hours', '24', 0);
