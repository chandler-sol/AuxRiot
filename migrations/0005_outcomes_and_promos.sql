-- Per-battle results, one row per participant. Lets a future credits system
-- retroactively award past records with the same rules (e.g. minimum counted votes).
CREATE TABLE battle_outcomes (
	battle_id TEXT NOT NULL REFERENCES battles(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	outcome TEXT NOT NULL,            -- win | loss | tie
	score REAL NOT NULL,              -- this user's final score
	opponent_score REAL NOT NULL,
	counted_votes INTEGER NOT NULL,
	closed_at INTEGER NOT NULL,
	PRIMARY KEY (battle_id, user_id)
);
CREATE INDEX battle_outcomes_user ON battle_outcomes(user_id, closed_at);

-- Backfill from battles that already finished.
INSERT INTO battle_outcomes (battle_id, user_id, outcome, score, opponent_score, counted_votes, closed_at)
SELECT id, creator_id,
       CASE WHEN winner_id IS NULL THEN 'tie' WHEN winner_id = creator_id THEN 'win' ELSE 'loss' END,
       COALESCE(json_extract(result_json, '$.slots[0].total'), 0),
       COALESCE(json_extract(result_json, '$.slots[1].total'), 0),
       COALESCE(json_extract(result_json, '$.countedVotes'), 0),
       COALESCE(voting_ends_at, created_at)
FROM battles WHERE status = 'closed' AND challenger_id IS NOT NULL;

INSERT INTO battle_outcomes (battle_id, user_id, outcome, score, opponent_score, counted_votes, closed_at)
SELECT id, challenger_id,
       CASE WHEN winner_id IS NULL THEN 'tie' WHEN winner_id = challenger_id THEN 'win' ELSE 'loss' END,
       COALESCE(json_extract(result_json, '$.slots[1].total'), 0),
       COALESCE(json_extract(result_json, '$.slots[0].total'), 0),
       COALESCE(json_extract(result_json, '$.countedVotes'), 0),
       COALESCE(voting_ends_at, created_at)
FROM battles WHERE status = 'closed' AND challenger_id IS NOT NULL;

-- Promoted battles: scheduled windows at the top of the feed.
CREATE TABLE promotions (
	id TEXT PRIMARY KEY,
	battle_id TEXT NOT NULL REFERENCES battles(id),
	booked_by TEXT NOT NULL REFERENCES users(id),
	source TEXT NOT NULL,             -- admin | credits (future)
	starts_at INTEGER NOT NULL,
	ends_at INTEGER NOT NULL,
	cancelled INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);
CREATE INDEX promotions_window ON promotions(cancelled, ends_at, starts_at);
CREATE INDEX promotions_battle ON promotions(battle_id);
