-- Sites: pages built from components (registry: shared/cms-components.json). Like Content Fragments, a page has a
-- working copy (content + properties), numbered versions, and published_version_id for what the public sees.
CREATE TABLE site_pages (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id            UUID REFERENCES site_pages (id),
    -- One path segment (slug); path = parent path + '/' + name
    name                 VARCHAR(120) NOT NULL,
    path                 VARCHAR(500) NOT NULL UNIQUE,
    template             VARCHAR(16)  NOT NULL CHECK (template IN ('landing', 'content')),
    title                VARCHAR(200) NOT NULL,
    -- The working copy: {regions: {main: [{id, type, props, children?}]}} and the page properties (SEO, menu…)
    content              JSONB        NOT NULL DEFAULT '{"regions": {"main": []}}',
    properties           JSONB        NOT NULL DEFAULT '{}',
    status               VARCHAR(16)  NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'MODIFIED')),
    published_version_id UUID,
    published_at         TIMESTAMPTZ,
    publish_at           TIMESTAMPTZ,
    unpublish_at         TIMESTAMPTZ,
    sort_order           INT          NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by           UUID REFERENCES users (id) ON DELETE SET NULL,
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by           UUID REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT chk_site_pages_published CHECK ((status = 'DRAFT') = (published_version_id IS NULL)),
    CONSTRAINT chk_site_pages_window CHECK (publish_at IS NULL OR unpublish_at IS NULL OR publish_at < unpublish_at)
);

-- Siblings by name are unique (also among top-level pages, whose parent is NULL)
CREATE UNIQUE INDEX uq_site_pages_sibling_name ON site_pages (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
CREATE INDEX idx_site_pages_parent ON site_pages (parent_id, sort_order);

CREATE TABLE site_page_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id     UUID         NOT NULL REFERENCES site_pages (id) ON DELETE CASCADE,
    version_no  INT          NOT NULL,
    title       VARCHAR(200) NOT NULL,
    content     JSONB        NOT NULL,
    properties  JSONB        NOT NULL,
    comment     VARCHAR(300),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
    UNIQUE (page_id, version_no)
);

ALTER TABLE site_pages
    ADD CONSTRAINT fk_site_pages_published_version FOREIGN KEY (published_version_id)
        REFERENCES site_page_versions (id) DEFERRABLE INITIALLY DEFERRED;

-- Old addresses of renamed or moved pages: answered with a 301 to the current path
CREATE TABLE site_page_path_history (
    old_path   VARCHAR(500) PRIMARY KEY,
    page_id    UUID        NOT NULL REFERENCES site_pages (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
