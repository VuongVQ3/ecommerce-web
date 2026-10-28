-- Short description (quick view, search snippets, <meta name="description">). NULL = not written yet: the public API
-- then derives one from the first paragraph of the full description (never stored).
ALTER TABLE products ADD COLUMN short_description varchar(160);
