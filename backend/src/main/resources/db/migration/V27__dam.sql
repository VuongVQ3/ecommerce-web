-- Assets (DAM): a shared library of images and PDFs for the CMS. Folders exist only here (every file sits in one
-- Cloudinary folder, hat-lanh/dam), so renaming or moving a folder never touches Cloudinary.
CREATE TABLE dam_folders (
    id         BIGSERIAL PRIMARY KEY,
    parent_id  BIGINT REFERENCES dam_folders (id),
    -- A slug (com.nutshop.common.Slugs); path = parent path + '/' + name
    name       VARCHAR(80)  NOT NULL,
    path       VARCHAR(500) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users (id) ON DELETE SET NULL,
    UNIQUE (parent_id, name)
);

-- One root (parent NULL): UNIQUE (parent_id, name) does not stop a second NULL parent, this does
CREATE UNIQUE INDEX uq_dam_folders_single_root ON dam_folders ((parent_id IS NULL)) WHERE parent_id IS NULL;

INSERT INTO dam_folders (parent_id, name, path) VALUES (NULL, 'hat-lanh', '/hat-lanh');
INSERT INTO dam_folders (parent_id, name, path)
SELECT root.id, child.name, '/hat-lanh/' || child.name
FROM dam_folders root, (VALUES ('banners'), ('san-pham'), ('tai-lieu')) AS child (name)
WHERE root.path = '/hat-lanh';

CREATE TABLE dam_assets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id         BIGINT        NOT NULL REFERENCES dam_folders (id),
    -- As uploaded; the stable link /files/{id}/{name} shows it (slugified) but never looks it up
    file_name         VARCHAR(200)  NOT NULL,
    kind              VARCHAR(8)    NOT NULL CHECK (kind IN ('IMAGE', 'PDF')),
    mime              VARCHAR(40)   NOT NULL,
    size_bytes        BIGINT        NOT NULL,
    width             INT,
    height            INT,
    page_count        INT,
    storage_public_id VARCHAR(255)  NOT NULL UNIQUE,
    url               TEXT          NOT NULL,
    storage_version   BIGINT,
    title             VARCHAR(150)  NOT NULL,
    alt               VARCHAR(200),
    description       VARCHAR(1000),
    tags              TEXT[]        NOT NULL DEFAULT '{}',
    checksum_sha256   CHAR(64)      NOT NULL UNIQUE,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by        UUID REFERENCES users (id) ON DELETE SET NULL,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_by        UUID REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX idx_dam_assets_folder_updated ON dam_assets (folder_id, updated_at DESC);
CREATE INDEX idx_dam_assets_tags ON dam_assets USING GIN (tags);
CREATE INDEX idx_dam_assets_title ON dam_assets (lower(title));
CREATE INDEX idx_dam_assets_file_name ON dam_assets (lower(file_name));

-- Which content uses which: written by Content Fragments and Sites (later phases), read by the DAM for "used where"
-- and to refuse deleting an asset still in use.
CREATE TABLE content_references (
    source_type VARCHAR(16) NOT NULL CHECK (source_type IN ('FRAGMENT', 'PAGE')),
    source_id   VARCHAR(64) NOT NULL,
    target_type VARCHAR(16) NOT NULL CHECK (target_type IN ('ASSET', 'FRAGMENT', 'PAGE', 'PRODUCT')),
    target_id   VARCHAR(64) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source_type, source_id, target_type, target_id)
);

CREATE INDEX idx_content_references_target ON content_references (target_type, target_id);
