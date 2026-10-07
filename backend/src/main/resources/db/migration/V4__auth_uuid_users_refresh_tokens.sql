-- Rebuild users with UUID keys, phone, active flag and the CUSTOMER/STAFF/ADMIN roles.
-- Nothing references users yet and the app has never been deployed, so existing (test) accounts are dropped.
DROP TABLE users;

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE CHECK (email = lower(email)),
    phone         VARCHAR(20) UNIQUE,
    full_name     VARCHAR(100) NOT NULL,
    -- Null for accounts that only sign in with Google
    password_hash VARCHAR(255),
    google_id     VARCHAR(255) UNIQUE,
    role          VARCHAR(20)  NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER', 'STAFF', 'ADMIN')),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- SHA-256 hex of the random token; the raw value only ever exists in the client's cookie
    token_hash     VARCHAR(64) NOT NULL UNIQUE,
    expires_at     TIMESTAMPTZ NOT NULL,
    revoked_at     TIMESTAMPTZ,
    replaced_by_id UUID REFERENCES refresh_tokens (id),
    user_agent     VARCHAR(512),
    ip             VARCHAR(64),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
