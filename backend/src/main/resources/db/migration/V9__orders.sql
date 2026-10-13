-- Cash-on-delivery orders. Lines keep a snapshot of name/price/weight at purchase time.
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- HL + yyMMdd (Vietnam time) + 4 random characters, e.g. HL261013K7QX
    code            VARCHAR(16)  NOT NULL UNIQUE,
    -- Sent by the checkout page once per visit: retries return the same order instead of creating another
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    user_id         UUID REFERENCES users (id) ON DELETE SET NULL,
    customer_name   VARCHAR(100) NOT NULL,
    phone           VARCHAR(10)  NOT NULL,
    email           VARCHAR(255),
    province        VARCHAR(100) NOT NULL,
    -- Vietnam removed the district level on 2025-07-01 (province -> ward). Kept nullable for old-style addresses.
    district        VARCHAR(100),
    ward            VARCHAR(100) NOT NULL,
    address_line    VARCHAR(255) NOT NULL,
    note            VARCHAR(500),
    subtotal        BIGINT       NOT NULL CHECK (subtotal >= 0),
    shipping_fee    BIGINT       NOT NULL CHECK (shipping_fee >= 0),
    total           BIGINT       NOT NULL CHECK (total = subtotal + shipping_fee),
    payment_method  VARCHAR(20)  NOT NULL DEFAULT 'COD' CHECK (payment_method IN ('COD')),
    status          VARCHAR(20)  NOT NULL
        CHECK (status IN ('PENDING', 'CONFIRMED', 'SHIPPING', 'COMPLETED', 'CANCELLED')),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_user ON orders (user_id, created_at DESC);

CREATE TABLE order_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID         NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id   BIGINT       NOT NULL REFERENCES products (id),
    product_name VARCHAR(200) NOT NULL,
    unit_price   BIGINT       NOT NULL CHECK (unit_price >= 0),
    weight_grams INT          NOT NULL,
    quantity     INT          NOT NULL CHECK (quantity > 0),
    line_total   BIGINT       NOT NULL CHECK (line_total = unit_price * quantity),
    UNIQUE (order_id, product_id)
);

CREATE TABLE order_status_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    from_status VARCHAR(20),
    to_status   VARCHAR(20) NOT NULL,
    -- Null for system actions and guest orders
    changed_by  UUID REFERENCES users (id) ON DELETE SET NULL,
    reason      VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_status_history_order ON order_status_history (order_id, created_at);

-- Every stock change, for auditing. quantity is signed and refers to the column named by type:
--   ORDER_RESERVE  reserved +q (stored as +q)      ORDER_CANCEL  reserved -q (stored as -q)
--   ORDER_SHIP     on_hand -q and reserved -q (-q) IMPORT        on_hand +q    ADJUST  on_hand +/-q
CREATE TABLE inventory_movements (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id BIGINT      NOT NULL REFERENCES products (id),
    quantity   INT         NOT NULL CHECK (quantity <> 0),
    type       VARCHAR(20) NOT NULL CHECK (type IN ('ORDER_RESERVE', 'ORDER_CANCEL', 'ORDER_SHIP', 'IMPORT', 'ADJUST')),
    order_id   UUID REFERENCES orders (id) ON DELETE SET NULL,
    actor_id   UUID REFERENCES users (id) ON DELETE SET NULL,
    note       VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_movements_product ON inventory_movements (product_id, created_at);
CREATE INDEX idx_inventory_movements_order ON inventory_movements (order_id);
