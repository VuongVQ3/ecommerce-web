-- Consent records for registration (terms of use / privacy policy, optional marketing emails).
ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMPTZ;
-- Only local test accounts exist before this migration; treat them as having accepted at sign-up.
UPDATE users SET terms_accepted_at = created_at;
ALTER TABLE users ALTER COLUMN terms_accepted_at SET NOT NULL;

ALTER TABLE users ADD COLUMN marketing_consent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN marketing_consent_at TIMESTAMPTZ;
