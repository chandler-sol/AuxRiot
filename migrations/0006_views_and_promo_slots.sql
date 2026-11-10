-- Unique views per battle (one per device), plus a running total for sorting.
ALTER TABLE battles ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
CREATE TABLE battle_views (
	battle_id TEXT NOT NULL,
	viewer_hash TEXT NOT NULL,
	viewed_at INTEGER NOT NULL,
	PRIMARY KEY (battle_id, viewer_hash)
);

-- Which promo slot (1 or 2) a booking occupies for its whole window.
ALTER TABLE promotions ADD COLUMN slot INTEGER;
