-- Battle Credits. Every earn/spend is a ledger row; users.credits is a cached
-- balance recomputed from the ledger after each change.
ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 0;

CREATE TABLE credit_ledger (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	amount INTEGER NOT NULL,          -- positive = earned, negative = spent / clawed back
	reason TEXT NOT NULL,             -- battle_win | battle_loss | battle_tie | promo_spend | promo_refund | admin_grant | admin_clawback
	ref TEXT NOT NULL DEFAULT '',     -- battle id, promotion attempt id, etc.
	note TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,      -- for battle awards: when the battle closed
	UNIQUE (user_id, reason, ref)     -- the same battle can never pay out twice
);
CREATE INDEX credit_ledger_user ON credit_ledger(user_id, created_at);

-- Minimum counted votes (after anti-cheat weighting) before a battle pays out.
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('credits_min_votes', '3', 0);
