-- The "Nhận thông tin khuyến mãi qua email" opt-in was removed: drop its columns (added by V6).
-- terms_accepted_at stays: accepting the terms is still required.
ALTER TABLE users DROP COLUMN IF EXISTS marketing_consent;
ALTER TABLE users DROP COLUMN IF EXISTS marketing_consent_at;
