-- CMS preview links: a draft (asset, content fragment or page) can be opened through a secret link for a limited
-- time. Only the SHA-256 hash of the token is stored; the raw token lives in the link alone.
CREATE TABLE content_preview_tokens (
    token_hash  VARCHAR(64) PRIMARY KEY,
    target_type VARCHAR(16) NOT NULL CHECK (target_type IN ('ASSET', 'FRAGMENT', 'PAGE')),
    target_id   VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- revokeAll(type, id) when content is deleted
CREATE INDEX idx_content_preview_tokens_target ON content_preview_tokens (target_type, target_id);
-- Daily sweep of expired tokens
CREATE INDEX idx_content_preview_tokens_expires_at ON content_preview_tokens (expires_at);
