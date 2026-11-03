-- Optional label information shown on the product page when set (NULL = not entered, nothing shown):
-- shelf life ("12 tháng kể từ ngày sản xuất"), ingredients, storage instructions.
ALTER TABLE products ADD COLUMN shelf_life VARCHAR(100);
ALTER TABLE products ADD COLUMN ingredients VARCHAR(500);
ALTER TABLE products ADD COLUMN storage_instructions VARCHAR(300);
