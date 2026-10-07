-- Accounts created through Google have no password.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Google's stable account identifier (the "sub" claim of the ID token).
ALTER TABLE users ADD COLUMN google_id VARCHAR(255);
CREATE UNIQUE INDEX ux_users_google_id ON users (google_id);
