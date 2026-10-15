-- Old product addresses keep working: /san-pham/<old slug> moves permanently to the current one
CREATE TABLE product_slug_history (
    id         BIGSERIAL PRIMARY KEY,
    product_id BIGINT       NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    old_slug   VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_slug_history_product ON product_slug_history (product_id);

-- Shared on social media before product 1 was renamed. While it is still product 1's own slug the current slug wins
-- (the row is then harmless and removed if the product takes the slug back after a rename).
INSERT INTO product_slug_history (product_id, old_slug)
SELECT id, 'hanh-nhan-rang-moc' FROM products WHERE id = 1
ON CONFLICT (old_slug) DO NOTHING;

-- Cancellations audited before reasons had their own column: copy the reason written in the order history
UPDATE audit_logs a
SET reason = LEFT(h.reason, 500)
FROM (SELECT DISTINCT ON (o.code) o.code, sh.reason
      FROM orders o JOIN order_status_history sh ON sh.order_id = o.id
      WHERE sh.to_status = 'CANCELLED' AND sh.reason IS NOT NULL
      ORDER BY o.code, sh.created_at DESC) h
WHERE a.action = 'ORDER_CANCEL' AND a.entity_type = 'ORDER' AND a.reason IS NULL AND a.entity_id = h.code;
