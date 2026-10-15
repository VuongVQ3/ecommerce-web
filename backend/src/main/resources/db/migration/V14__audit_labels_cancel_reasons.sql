-- Readable audit log: the entity's name when the row was written, the reason given, and who acted
ALTER TABLE audit_logs ADD COLUMN entity_label VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN reason VARCHAR(500);
ALTER TABLE audit_logs ADD COLUMN reason_code VARCHAR(50);
ALTER TABLE audit_logs ADD COLUMN actor_type VARCHAR(20) NOT NULL DEFAULT 'STAFF'
    CHECK (actor_type IN ('STAFF', 'CUSTOMER', 'SYSTEM'));
-- Existing rows: no actor = the application; email verification and order claims are done by the customer
UPDATE audit_logs SET actor_type = 'SYSTEM' WHERE actor_id IS NULL;
UPDATE audit_logs SET actor_type = 'CUSTOMER' WHERE action IN ('USER_EMAIL_VERIFIED', 'ORDER_CLAIMED');
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at);

-- Why and by whom an order was cancelled. Customers pick one of their own reasons when cancelling.
ALTER TABLE orders DROP CONSTRAINT orders_cancel_reason_code_check;
ALTER TABLE orders ALTER COLUMN cancel_reason_code TYPE VARCHAR(30);
ALTER TABLE orders ADD CONSTRAINT orders_cancel_reason_code_check
    CHECK (cancel_reason_code IN ('CHANGED_MIND', 'CHANGE_ITEMS', 'CHANGE_ADDRESS', 'DUPLICATE_ORDER', 'BETTER_PRICE',
                                  'CUSTOMER_REQUEST', 'OUT_OF_STOCK', 'REFUSED_DELIVERY', 'UNREACHABLE', 'OTHER'));
ALTER TABLE orders ADD COLUMN cancel_reason VARCHAR(300);
ALTER TABLE orders ADD COLUMN cancelled_by_type VARCHAR(20) CHECK (cancelled_by_type IN ('STAFF', 'CUSTOMER'));
-- Existing cancellations: self-service ones were written as "Khách huỷ đơn…" in the history
UPDATE orders o SET cancelled_by_type = CASE
        WHEN EXISTS (SELECT 1 FROM order_status_history h
                     WHERE h.order_id = o.id AND h.to_status = 'CANCELLED' AND h.reason LIKE 'Khách huỷ đơn%')
        THEN 'CUSTOMER' ELSE 'STAFF' END
    WHERE o.status = 'CANCELLED';
CREATE INDEX idx_orders_cancel_reason ON orders (cancel_reason_code) WHERE cancel_reason_code IS NOT NULL;

-- "Khách huỷ: <reason> – <note up to 300 characters>" and staff reasons (up to 500) must fit
ALTER TABLE order_status_history ALTER COLUMN reason TYPE VARCHAR(600);
