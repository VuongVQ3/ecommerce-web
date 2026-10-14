-- Tracking links for guest orders: /don-hang/{code}?t={token}. Only the SHA-256 of each token is stored.
-- Several tokens may be valid for one order (the confirmation email and each status email carry their own),
-- so links customers saved earlier keep working until they expire. All are deleted when the order is
-- attached to an account (it is then visible under "Đơn hàng của tôi").
CREATE TABLE order_access_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_access_tokens_order ON order_access_tokens (order_id);

-- Guest orders are attached to an account by email only after that email is verified
CREATE INDEX idx_orders_guest_email ON orders (lower(email)) WHERE user_id IS NULL;

ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
-- Google has already verified the email of accounts created or linked through Google Sign-In
UPDATE users SET email_verified_at = created_at WHERE google_id IS NOT NULL;

CREATE TABLE email_verification_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_verification_tokens_user ON email_verification_tokens (user_id);
