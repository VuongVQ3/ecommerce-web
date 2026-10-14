-- Staff/admin accounts whose password does not meet the current rules must change it before using the back office
ALTER TABLE users ADD COLUMN password_change_required BOOLEAN NOT NULL DEFAULT FALSE;

-- One table for single-use password links: RESET (30 minutes) and INVITE (new staff account, 48 hours).
-- The lifetime is stored per row in expires_at.
ALTER TABLE password_reset_tokens ADD COLUMN purpose VARCHAR(10) NOT NULL DEFAULT 'RESET'
    CHECK (purpose IN ('RESET', 'INVITE'));

-- Phone numbers the shop wants to watch or stop taking cash-on-delivery orders from (normalized 0xxxxxxxxx)
CREATE TABLE phone_flags (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone      VARCHAR(10)  NOT NULL UNIQUE,
    level      VARCHAR(10)  NOT NULL CHECK (level IN ('WATCH', 'BLOCK_COD')),
    reason     VARCHAR(500) NOT NULL,
    created_by UUID REFERENCES users (id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Why an order was cancelled, as a code (the free-text reason stays in order_status_history)
ALTER TABLE orders ADD COLUMN cancel_reason_code VARCHAR(20)
    CHECK (cancel_reason_code IN ('CUSTOMER_REQUEST', 'OUT_OF_STOCK', 'REFUSED_DELIVERY', 'UNREACHABLE', 'OTHER'));
UPDATE orders SET cancel_reason_code = 'OTHER' WHERE status = 'CANCELLED';
CREATE INDEX idx_orders_phone ON orders (phone);

-- Parcels refused at the door come back to the shelf: RETURN adds to on_hand.
-- Invariants become: on_hand = Σ(IMPORT, ADJUST, ORDER_SHIP, RETURN); reserved = Σ(ORDER_RESERVE, ORDER_CANCEL, ORDER_SHIP)
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_type_check
    CHECK (type IN ('ORDER_RESERVE', 'ORDER_CANCEL', 'ORDER_SHIP', 'IMPORT', 'ADJUST', 'RETURN'));

-- Invited staff accept the terms when they set their password (null until then)
ALTER TABLE users ALTER COLUMN terms_accepted_at DROP NOT NULL;
