-- Last sign-in or session refresh, for the retention job (privacy policy B.6: accounts unused for 24 months are
-- deleted). Kept on the user because the login logs it could be derived from (refresh_tokens) are deleted after 90 days.
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
UPDATE users u SET last_login_at = COALESCE((SELECT max(r.created_at) FROM refresh_tokens r WHERE r.user_id = u.id),
                                            u.created_at);
ALTER TABLE users ALTER COLUMN last_login_at SET DEFAULT now();
ALTER TABLE users ALTER COLUMN last_login_at SET NOT NULL;
CREATE INDEX idx_users_last_login ON users (last_login_at);
