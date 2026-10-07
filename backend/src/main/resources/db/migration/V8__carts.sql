-- One cart per signed-in user. Guests keep their cart in the browser (localStorage).
CREATE TABLE carts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only product + quantity; price, name, image and stock are always read from products.
-- price_at_add is kept solely to tell the shopper the price changed since they added it.
CREATE TABLE cart_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id      UUID        NOT NULL REFERENCES carts (id) ON DELETE CASCADE,
    product_id   BIGINT      NOT NULL REFERENCES products (id),
    -- Hard safety cap; the business limit (cart.max-qty-per-item, default 10) is enforced by the app,
    -- so it can be changed without a migration.
    quantity     INT         NOT NULL CHECK (quantity BETWEEN 1 AND 99),
    price_at_add BIGINT      NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Concurrent "add" requests upsert on this key instead of creating duplicate lines
    UNIQUE (cart_id, product_id)
);

-- Guest-cart merges already applied, so retrying POST /api/cart/merge with the same key does not add twice.
CREATE TABLE cart_merges (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id    UUID         NOT NULL REFERENCES carts (id) ON DELETE CASCADE,
    merge_key  VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (cart_id, merge_key)
);
