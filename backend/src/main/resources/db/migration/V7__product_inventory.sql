-- Inventory: on_hand = physically in stock, reserved = held by orders not yet shipped (set by checkout later).
-- Purchasable quantity = on_hand - reserved. Existing stock values carry over as on_hand.
ALTER TABLE products RENAME COLUMN stock TO on_hand;
ALTER TABLE products ADD COLUMN reserved INT NOT NULL DEFAULT 0;
ALTER TABLE products ADD CONSTRAINT chk_products_inventory
    CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand);

-- Discontinued products stay in the database (old carts/orders reference them) but cannot be bought.
ALTER TABLE products ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
