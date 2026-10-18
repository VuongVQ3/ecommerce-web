-- Dashboard day view: orders created in a day, status changes (completed / cancelled) in a day, pending > 24 h
CREATE INDEX idx_orders_created_at ON orders (created_at);
CREATE INDEX idx_order_status_history_status_time ON order_status_history (to_status, created_at);
CREATE INDEX idx_orders_pending_created ON orders (created_at) WHERE status = 'PENDING';
