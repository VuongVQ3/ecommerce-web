-- Time-limited sale prices. The regular price stays in products.price; a promotion only lowers it between starts_at
-- (inclusive) and ends_at (exclusive). Rules that depend on configuration (max discount %, max days per year) are
-- checked by PromotionService; the database guarantees the invariants below.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE product_promotions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  BIGINT      NOT NULL REFERENCES products (id),
    sale_price  BIGINT      NOT NULL CHECK (sale_price > 0),
    starts_at   TIMESTAMPTZ NOT NULL,
    ends_at     TIMESTAMPTZ NOT NULL,
    -- false = cancelled before it started (kept for the audit trail, ignored everywhere else)
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT product_promotions_period CHECK (ends_at > starts_at),
    -- Never two active promotions of one product at the same time, even under concurrent requests
    CONSTRAINT product_promotions_no_overlap
        EXCLUDE USING gist (product_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (active)
);
CREATE INDEX idx_product_promotions_product ON product_promotions (product_id, starts_at);

-- The regular price at purchase time (unit_price is what the buyer actually paid)
ALTER TABLE order_items ADD COLUMN regular_unit_price BIGINT;
UPDATE order_items SET regular_unit_price = unit_price;
ALTER TABLE order_items ALTER COLUMN regular_unit_price SET NOT NULL;
ALTER TABLE order_items ADD CONSTRAINT order_items_regular_price CHECK (regular_unit_price >= unit_price);
