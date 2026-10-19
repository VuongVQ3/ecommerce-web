-- Storefront order of the real catalogue, as listed by the owner (V17 added products.sort_order). Set again by slug so
-- the order holds whatever ids the rows got. The V2 sample products (hidden) go to the end of the admin list.
UPDATE products p SET sort_order = v.sort_order
FROM (VALUES
    ('mac-ca-size-22-25', 1), ('mac-ca-size-26-28', 2), ('mac-ca-size-tu-28', 3), ('nhan-mac-ca-nguyen-hat', 4),
    ('nhan-mac-ca-vo', 5), ('hat-dieu-a-co-rang-muoi-xep-hoa', 6), ('hat-dieu-a-co-rang-muoi-hu-pet', 7),
    ('hat-dieu-vo-say', 8), ('hat-dieu-sua-song', 9), ('hanh-nhan-say', 10), ('hanh-nhan-rang-bo', 11),
    ('oc-cho-do-nguyen-qua', 12), ('nhan-oc-cho-do-hop-lon', 13), ('nhan-hat-bi-xanh-say', 14),
    ('ngu-coc-hat-dinh-duong', 15), ('hat-dinh-duong-mix-nguyen-hat', 16), ('hat-dinh-duong-mix-hat-vo', 17),
    ('thanh-gao-lut-cha-bong', 18), ('thanh-gao-lut-rong-bien', 19), ('rong-bien-kep-hat-dinh-duong', 20),
    ('banh-thuyen-hat-dinh-duong', 21), ('banh-thuyen-hat-dieu-mac-ca', 22), ('xoai-say-deo', 23), ('bot-ca-cao', 24),
    ('mat-ong-hoa-ca-phe', 25)
) AS v (slug, sort_order)
WHERE p.slug = v.slug;

UPDATE products SET sort_order = 1000
WHERE slug IN ('hanh-nhan-rang-moc', 'nhan-oc-cho-vang', 'hat-macca-nut-vo', 'hat-dieu-rang-moc', 'hat-de-cuoi-khong-muoi',
               'hat-phi-tach-vo', 'hat-chia-uc', 'hat-lanh-vang', 'hat-bi-xanh-tach-vo', 'hat-diem-mach-3-mau',
               'hat-huong-duong-tach-vo', 'hat-mix-5-loai', 'granola-an-kieng-khong-duong')
   OR id IN (SELECT product_id FROM product_slug_history
             WHERE old_slug IN ('hanh-nhan-rang-moc', 'nhan-oc-cho-vang', 'hat-macca-nut-vo', 'hat-dieu-rang-moc',
                                'hat-de-cuoi-khong-muoi', 'hat-phi-tach-vo', 'hat-chia-uc', 'hat-lanh-vang',
                                'hat-bi-xanh-tach-vo', 'hat-diem-mach-3-mau', 'hat-huong-duong-tach-vo',
                                'hat-mix-5-loai', 'granola-an-kieng-khong-duong'));
