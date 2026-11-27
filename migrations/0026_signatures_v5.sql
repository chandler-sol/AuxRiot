-- v5 signing records (Exclusive Beat License §7, Seller Agreement Checklist, Store Terms "Electronic records").
-- Every acceptance (seller account, listing offer, buyer order, site terms) is kept with the exact
-- statement agreed to and a snapshot of what was shown, so either party can evidence the deal.
CREATE TABLE acceptances (
	id TEXT PRIMARY KEY,
	kind TEXT NOT NULL,                 -- seller_account | listing | order | site_terms
	user_id TEXT NOT NULL REFERENCES users(id),
	subject_id TEXT,                    -- listing id / order id
	doc_version TEXT NOT NULL,          -- license / terms version agreed to
	signer_name TEXT,                   -- typed full legal name
	capacity TEXT,                      -- 'self' or the signer's role for an entity
	entity TEXT,                        -- legal entity name when signing for one
	statement TEXT NOT NULL,            -- the exact words agreed to
	snapshot TEXT,                      -- JSON of the terms shown (prices, files, rights schedule...)
	ip_hash TEXT,
	user_agent TEXT,
	created_at INTEGER NOT NULL
);
CREATE INDEX acceptances_subject ON acceptances(kind, subject_id);
CREATE INDEX acceptances_user ON acceptances(user_id, kind, created_at);

-- Listing offer (step two of the seller checklist)
ALTER TABLE listings ADD COLUMN listing_version INTEGER NOT NULL DEFAULT 0;   -- bumps on every new signature
ALTER TABLE listings ADD COLUMN producer_credit TEXT;          -- public "Prod. by" credit
ALTER TABLE listings ADD COLUMN producer_entity TEXT;          -- legal entity, if signing for one
ALTER TABLE listings ADD COLUMN producer_capacity TEXT;        -- 'self' or role (e.g. "Owner")
ALTER TABLE listings ADD COLUMN rights_schedule TEXT;          -- JSON: samples, ai, voice, collaborators, restrictions
ALTER TABLE listings ADD COLUMN producer_acceptance_id TEXT;

-- Buyer signature and the order's record fields
ALTER TABLE orders ADD COLUMN buyer_capacity TEXT;
ALTER TABLE orders ADD COLUMN buyer_entity TEXT;
ALTER TABLE orders ADD COLUMN buyer_acceptance_id TEXT;
ALTER TABLE orders ADD COLUMN producer_acceptance_id TEXT;
ALTER TABLE orders ADD COLUMN listing_version INTEGER;
ALTER TABLE orders ADD COLUMN records_consent_at INTEGER;      -- consent to electronic records (E-SIGN)
ALTER TABLE orders ADD COLUMN store_terms_version TEXT;
ALTER TABLE orders ADD COLUMN merchant TEXT;                   -- "AuxRiot (…) · statement: AUXRIOT"
ALTER TABLE orders ADD COLUMN file_manifest TEXT;              -- JSON of delivered files and identifiers
ALTER TABLE orders ADD COLUMN receipt_sent_at INTEGER;

-- Site Terms / Privacy version each user last accepted (material changes need new acceptance)
ALTER TABLE users ADD COLUMN terms_version TEXT;

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('store_merchant_name', 'Chandler Solomon, operating AuxRiot (Waxhaw, NC)', 0);
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('store_statement_descriptor', 'AUXRIOT', 0);

-- Beta test producers' listings: re-sign under v5 automatically so the test lab keeps working.
-- Real producers sign again themselves (their listings show "sign the updated listing").
UPDATE listings SET license_version = '2026-11-27-v5', listing_version = 1, producer_capacity = 'self',
       producer_credit = (SELECT username FROM users WHERE users.id = listings.seller_id),
       rights_schedule = '{"writers":"Sole writer and producer, 100%. No publisher.","samples":"none","ai":"none","voice":"none","restrictions":"none"}'
 WHERE producer_signed_at IS NOT NULL AND seller_id IN (SELECT id FROM users WHERE is_test = 1);
