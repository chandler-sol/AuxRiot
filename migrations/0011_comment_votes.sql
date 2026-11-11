-- Comment upvotes and the respect score behind commenter flair.
CREATE TABLE comment_votes (
	comment_id TEXT NOT NULL REFERENCES comments(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	counted INTEGER NOT NULL DEFAULT 1,   -- 0 = same device as the author (silently ignored)
	created_at INTEGER NOT NULL,
	PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX comment_votes_user ON comment_votes(user_id);

ALTER TABLE comments ADD COLUMN upvotes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN respect INTEGER NOT NULL DEFAULT 0;
