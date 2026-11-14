-- One "finish your ballot" reminder per judge per battle.
CREATE TABLE judge_reminders (
	battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
	voter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	sent_at INTEGER NOT NULL,
	PRIMARY KEY (battle_id, voter_id)
);
