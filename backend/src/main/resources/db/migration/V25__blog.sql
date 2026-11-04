-- Blog: posts written in Markdown in the back office, read at /blog/{slug}. A published post always has a date, an
-- excerpt (meta description and card text) and a cover image with alt text (Open Graph image, card image).
CREATE TABLE blog_posts (
    id                    BIGSERIAL PRIMARY KEY,
    title                 VARCHAR(150) NOT NULL,
    slug                  VARCHAR(200) NOT NULL UNIQUE,
    excerpt               VARCHAR(300),
    content               TEXT         NOT NULL DEFAULT '',
    cover_image_url       TEXT,
    cover_image_public_id VARCHAR(255),
    cover_image_alt       VARCHAR(200),
    status                VARCHAR(16)  NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
    published_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by            UUID REFERENCES users (id) ON DELETE SET NULL,
    updated_by            UUID REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT chk_blog_cover_alt CHECK (cover_image_url IS NULL OR NULLIF(btrim(cover_image_alt), '') IS NOT NULL),
    CONSTRAINT chk_blog_published CHECK (status <> 'PUBLISHED' OR (published_at IS NOT NULL
        AND NULLIF(btrim(excerpt), '') IS NOT NULL AND cover_image_url IS NOT NULL))
);
CREATE INDEX idx_blog_posts_published ON blog_posts (status, published_at DESC);

-- Every image uploaded for a post: deleted from Cloudinary with the post, and gives width/height to the renderer
CREATE TABLE blog_post_images (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    BIGINT       NOT NULL REFERENCES blog_posts (id) ON DELETE CASCADE,
    public_id  VARCHAR(255) NOT NULL UNIQUE,
    url        TEXT         NOT NULL,
    width      INT,
    height     INT,
    alt        VARCHAR(200),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_blog_post_images_post ON blog_post_images (post_id);

-- Products shown at the end of a post, in this order
CREATE TABLE blog_post_products (
    post_id    BIGINT NOT NULL REFERENCES blog_posts (id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    position   INT    NOT NULL,
    PRIMARY KEY (post_id, product_id)
);
CREATE INDEX idx_blog_post_products_product ON blog_post_products (product_id);

-- Old slugs of renamed posts: /blog/<old> redirects permanently (as product_slug_history)
CREATE TABLE blog_slug_history (
    old_slug   VARCHAR(200) PRIMARY KEY,
    post_id    BIGINT      NOT NULL REFERENCES blog_posts (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_blog_slug_history_post ON blog_slug_history (post_id);
