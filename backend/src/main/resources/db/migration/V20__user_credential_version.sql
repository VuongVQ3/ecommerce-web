-- Credential/session version: bumped whenever an account's credentials change (password set/change, or the
-- Google takeover that clears an unverified account's password). Access tokens carry this value; a token whose
-- version is behind the account's current version is rejected, so a credential change invalidates older sessions
-- at once instead of letting an access token live out its TTL. (run-2 lead 4)
ALTER TABLE users ADD COLUMN credential_version integer NOT NULL DEFAULT 0;
