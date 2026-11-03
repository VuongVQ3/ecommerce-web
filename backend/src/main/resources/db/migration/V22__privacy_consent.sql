-- Privacy policy consent, asked separately from the terms (its own unticked checkbox on sign-up and checkout).
-- When it was given and which version of the policy page it was given to (site.PolicyVersion.CURRENT).
-- Rows from before this migration stay NULL: they only accepted the old combined terms + privacy notice.
ALTER TABLE users ADD COLUMN privacy_consent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN policy_version VARCHAR(20);

ALTER TABLE orders ADD COLUMN privacy_consent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN policy_version VARCHAR(20);
