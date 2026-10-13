-- Admin back office: stock alerts, shipping info, internal notes, purchase cost, product images, audit trail.

ALTER TABLE products ADD COLUMN low_stock_threshold INT NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0);
ALTER TABLE products ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE orders ADD COLUMN carrier VARCHAR(100);
ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(100);

CREATE TABLE order_notes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID          NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    author_id  UUID REFERENCES users (id) ON DELETE SET NULL,
    body       VARCHAR(1000) NOT NULL,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_notes_order ON order_notes (order_id, created_at);

-- Purchase details for IMPORT rows
ALTER TABLE inventory_movements ADD COLUMN unit_cost BIGINT CHECK (unit_cost >= 0);
ALTER TABLE inventory_movements ADD COLUMN supplier VARCHAR(200);

-- Up to 5 images per product (enforced by the app); exactly one primary at most
CREATE TABLE product_images (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id BIGINT       NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    public_id  VARCHAR(255) NOT NULL UNIQUE,
    url        VARCHAR(500) NOT NULL,
    width      INT,
    height     INT,
    is_primary BOOLEAN      NOT NULL DEFAULT FALSE,
    position   INT          NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_images_product ON product_images (product_id, position);
CREATE UNIQUE INDEX ux_product_images_primary ON product_images (product_id) WHERE is_primary;

-- Who changed what in the back office
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID REFERENCES users (id) ON DELETE SET NULL,
    action      VARCHAR(50)  NOT NULL,
    entity_type VARCHAR(50)  NOT NULL,
    entity_id   VARCHAR(100) NOT NULL,
    before      JSONB,
    after       JSONB,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id, created_at);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id, created_at);

-- Opening balance, so that from now on for every product:
--   on_hand  = SUM(quantity) of IMPORT, ADJUST, ORDER_SHIP movements
--   reserved = SUM(quantity) of ORDER_RESERVE, ORDER_CANCEL, ORDER_SHIP movements
INSERT INTO inventory_movements (product_id, quantity, type, note)
SELECT id, on_hand, 'ADJUST', 'Tồn đầu kỳ' FROM products WHERE on_hand > 0;
