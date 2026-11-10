-- Signature color per user, and the colors locked in for each battle.
ALTER TABLE users ADD COLUMN color TEXT;
ALTER TABLE battles ADD COLUMN color_a TEXT;
ALTER TABLE battles ADD COLUMN color_b TEXT;
