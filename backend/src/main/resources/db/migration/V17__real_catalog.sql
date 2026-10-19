-- The shop's real catalogue (25 products, all 500 g packs) replaces the 13 sample products of V2.
-- Prices, stock, origin and nutrition are not known yet: the new products are created HIDDEN with price 0, and the
-- owner fills them in the back office before showing them. Sample products are hidden, never deleted (orders, carts
-- and promotions refer to them).

-- ---- categories ---------------------------------------------------------------------------------------------------

-- Old category slugs that must keep working (301 to the current slug), like product_slug_history
CREATE TABLE category_slug_history (
    old_slug    VARCHAR(100) PRIMARY KEY,
    category_id BIGINT       NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

UPDATE categories SET name = 'Hạt mix & ngũ cốc', slug = 'hat-mix-ngu-coc' WHERE slug = 'hat-mix-granola';
INSERT INTO category_slug_history (old_slug, category_id)
SELECT 'hat-mix-granola', id FROM categories WHERE slug = 'hat-mix-ngu-coc'
ON CONFLICT (old_slug) DO NOTHING;

INSERT INTO categories (name, slug) VALUES
    ('Bánh & thanh hạt', 'banh-thanh-hat'),
    ('Trái cây sấy & đặc sản', 'trai-cay-say-dac-san')
ON CONFLICT (slug) DO NOTHING;

-- ---- products: room for unknown values and a manual order ---------------------------------------------------------

ALTER TABLE products ALTER COLUMN calories DROP NOT NULL;
ALTER TABLE products ALTER COLUMN protein DROP NOT NULL;
ALTER TABLE products ALTER COLUMN fat DROP NOT NULL;
ALTER TABLE products ALTER COLUMN carbs DROP NOT NULL;
ALTER TABLE products ALTER COLUMN fiber DROP NOT NULL;

-- Default order on the storefront (then id); editable in the back office
ALTER TABLE products ADD COLUMN sort_order INT NOT NULL DEFAULT 0;

-- A product without a price can exist (being prepared) but never be on sale
ALTER TABLE products ADD CONSTRAINT products_price_when_active CHECK (price > 0 OR active = false);

-- ---- hide the sample products and end their promotions ------------------------------------------------------------

CREATE TEMPORARY TABLE sample_products ON COMMIT DROP AS
SELECT id FROM products
WHERE slug IN ('hanh-nhan-rang-moc', 'nhan-oc-cho-vang', 'hat-macca-nut-vo', 'hat-dieu-rang-moc', 'hat-de-cuoi-khong-muoi',
               'hat-phi-tach-vo', 'hat-chia-uc', 'hat-lanh-vang', 'hat-bi-xanh-tach-vo', 'hat-diem-mach-3-mau',
               'hat-huong-duong-tach-vo', 'hat-mix-5-loai', 'granola-an-kieng-khong-duong')
   -- renamed since V2
   OR id IN (SELECT product_id FROM product_slug_history
             WHERE old_slug IN ('hanh-nhan-rang-moc', 'nhan-oc-cho-vang', 'hat-macca-nut-vo', 'hat-dieu-rang-moc',
                                'hat-de-cuoi-khong-muoi', 'hat-phi-tach-vo', 'hat-chia-uc', 'hat-lanh-vang',
                                'hat-bi-xanh-tach-vo', 'hat-diem-mach-3-mau', 'hat-huong-duong-tach-vo',
                                'hat-mix-5-loai', 'granola-an-kieng-khong-duong'));

UPDATE products SET active = false, updated_at = now() WHERE id IN (SELECT id FROM sample_products);

-- Running promotions end now; upcoming ones are cancelled (ends_at = now() would come before their start)
UPDATE product_promotions SET ends_at = now(), updated_at = now()
WHERE active AND product_id IN (SELECT id FROM sample_products) AND starts_at <= now() AND ends_at > now();
UPDATE product_promotions SET active = false, updated_at = now()
WHERE active AND product_id IN (SELECT id FROM sample_products) AND starts_at > now();

-- ---- the real catalogue (hidden until priced) ---------------------------------------------------------------------

INSERT INTO products (category_id, name, slug, description, origin, price, weight_grams, on_hand, reserved, active,
                      image_url, calories, protein, fat, carbs, fiber, sort_order)
SELECT c.id, v.name, v.slug, v.description, NULL, 0, 500, 0, 0, false, NULL, NULL, NULL, NULL, NULL, NULL, v.sort_order
FROM (VALUES
    (1, 'hat-dinh-duong', 'Mắc ca size 22–25 mm (loại trung)', 'mac-ca-size-22-25',
        'Mắc ca nguyên vỏ cỡ 22–25 mm, hạt vừa, vị béo bùi.'),
    (2, 'hat-dinh-duong', 'Mắc ca size 26–28 mm (loại đại)', 'mac-ca-size-26-28',
        'Mắc ca nguyên vỏ cỡ 26–28 mm, hạt to, chắc.'),
    (3, 'hat-dinh-duong', 'Mắc ca size từ 28 mm (loại VIP)', 'mac-ca-size-tu-28',
        'Mắc ca nguyên vỏ cỡ lớn nhất, từ 28 mm trở lên, hợp làm quà biếu.'),
    (4, 'hat-dinh-duong', 'Nhân mắc ca nguyên hạt', 'nhan-mac-ca-nguyen-hat',
        'Nhân mắc ca đã tách vỏ, nguyên hạt, ăn liền hoặc làm bánh.'),
    (5, 'hat-dinh-duong', 'Nhân mắc ca vỡ', 'nhan-mac-ca-vo',
        'Nhân mắc ca dạng vỡ, cùng chất lượng, giá mềm hơn, hợp làm bánh, sữa hạt.'),
    (6, 'hat-dinh-duong', 'Hạt điều A cồ rang muối – hũ xếp hoa', 'hat-dieu-a-co-rang-muoi-xep-hoa',
        'Hạt điều loại A cồ rang muối, xếp hoa đẹp mắt trong hũ, hợp tiếp khách và làm quà.'),
    (7, 'hat-dinh-duong', 'Hạt điều A cồ rang muối – hũ PET', 'hat-dieu-a-co-rang-muoi-hu-pet',
        'Hạt điều loại A cồ rang muối, đóng hũ nhựa PET tiện dùng hằng ngày.'),
    (8, 'hat-dinh-duong', 'Hạt điều vỡ sấy, sạch vỏ lụa', 'hat-dieu-vo-say',
        'Hạt điều vỡ đã bóc sạch vỏ lụa, sấy giòn, hợp làm bánh, nấu sữa hạt hoặc ăn vặt.'),
    (9, 'hat-dinh-duong', 'Hạt điều sữa sống', 'hat-dieu-sua-song',
        'Hạt điều sữa chưa rang, dùng nấu sữa hạt hoặc tự rang theo khẩu vị.'),
    (10, 'hat-dinh-duong', 'Hạnh nhân sấy', 'hanh-nhan-say',
        'Hạnh nhân sấy giòn, ăn liền hoặc rắc lên sữa chua, yến mạch.'),
    (11, 'hat-dinh-duong', 'Hạnh nhân rang bơ', 'hanh-nhan-rang-bo',
        'Hạnh nhân rang bơ thơm béo, món ăn vặt dễ ăn.'),
    (12, 'hat-dinh-duong', 'Óc chó đỏ nguyên quả', 'oc-cho-do-nguyen-qua',
        'Óc chó đỏ còn nguyên vỏ, tự tách khi dùng để giữ độ tươi.'),
    (13, 'hat-dinh-duong', 'Nhân óc chó đỏ – hộp lon', 'nhan-oc-cho-do-hop-lon',
        'Nhân óc chó đỏ đã tách vỏ, đóng hộp lon kín.'),
    (14, 'hat-dinh-duong', 'Nhân hạt bí xanh sấy', 'nhan-hat-bi-xanh-say',
        'Nhân hạt bí xanh đã tách vỏ, sấy giòn, ăn liền hoặc rắc salad.'),
    (15, 'hat-mix-ngu-coc', 'Ngũ cốc hạt dinh dưỡng', 'ngu-coc-hat-dinh-duong',
        'Ngũ cốc phối cùng các loại hạt, dùng với sữa hoặc sữa chua cho bữa sáng nhanh.'),
    (16, 'hat-mix-ngu-coc', 'Hạt dinh dưỡng mix – nguyên hạt', 'hat-dinh-duong-mix-nguyen-hat',
        'Hỗn hợp nhiều loại hạt nguyên hạt, ăn vặt hằng ngày.'),
    (17, 'hat-mix-ngu-coc', 'Hạt dinh dưỡng mix – hạt vỡ', 'hat-dinh-duong-mix-hat-vo',
        'Hỗn hợp nhiều loại hạt dạng vỡ, giá mềm, hợp làm bánh, granola, sữa hạt.'),
    (18, 'banh-thanh-hat', 'Thanh gạo lứt chà bông', 'thanh-gao-lut-cha-bong',
        'Thanh gạo lứt kết hợp chà bông, món ăn nhẹ tiện mang theo.'),
    (19, 'banh-thanh-hat', 'Thanh gạo lứt rong biển', 'thanh-gao-lut-rong-bien',
        'Thanh gạo lứt kết hợp rong biển, giòn thơm.'),
    (20, 'banh-thanh-hat', 'Rong biển kẹp hạt dinh dưỡng', 'rong-bien-kep-hat-dinh-duong',
        'Lá rong biển kẹp các loại hạt, giòn, đậm vị.'),
    (21, 'banh-thanh-hat', 'Bánh thuyền hạt dinh dưỡng', 'banh-thuyen-hat-dinh-duong',
        'Bánh thuyền giòn phủ nhiều loại hạt dinh dưỡng.'),
    (22, 'banh-thanh-hat', 'Bánh thuyền hạt điều – mắc ca', 'banh-thuyen-hat-dieu-mac-ca',
        'Bánh thuyền giòn phủ hạt điều và mắc ca.'),
    (23, 'trai-cay-say-dac-san', 'Xoài sấy dẻo', 'xoai-say-deo',
        'Xoài sấy dẻo, vị chua ngọt tự nhiên của xoài.'),
    (24, 'trai-cay-say-dac-san', 'Bột ca cao', 'bot-ca-cao',
        'Bột ca cao pha thức uống nóng/lạnh hoặc làm bánh.'),
    (25, 'trai-cay-say-dac-san', 'Mật ong hoa cà phê', 'mat-ong-hoa-ca-phe',
        'Mật ong từ hoa cà phê, vị ngọt đậm, thơm nhẹ.')
) AS v (sort_order, category_slug, name, slug, description)
JOIN categories c ON c.slug = v.category_slug
ON CONFLICT (slug) DO NOTHING;
