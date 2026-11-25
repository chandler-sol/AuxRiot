-- Chargebacks (disputes) on beat orders. AuxRiot carries dispute losses (Connect
-- marketplace setup), so the producer's transfer is pulled back while a dispute
-- is open, and paid again if we win it.
ALTER TABLE orders ADD COLUMN dispute_status TEXT;          -- needs_response | under_review | won | lost | ...
ALTER TABLE orders ADD COLUMN disputed_at INTEGER;
ALTER TABLE orders ADD COLUMN transfer_reversed INTEGER NOT NULL DEFAULT 0;
CREATE INDEX orders_status ON orders(status, created_at);
