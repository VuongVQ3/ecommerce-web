-- Content Fragments: structured content following a model (AEM style). A model lists its fields as JSON; a fragment
-- keeps a working copy (what authors edit) and numbered versions; publishing points published_version_id at a
-- version, and the public delivery API only ever reads that version.
CREATE TABLE cf_models (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(80)  NOT NULL UNIQUE,
    description VARCHAR(500),
    -- [{name, label, type, required, multiple, help, rules}]
    fields      JSONB        NOT NULL DEFAULT '[]',
    status      VARCHAR(16)  NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ENABLED', 'DISABLED')),
    -- +1 on every save of the model
    version     INT          NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by  UUID REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT chk_cf_models_fields_array CHECK (jsonb_typeof(fields) = 'array')
);

CREATE TABLE cf_fragments (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id             BIGINT       NOT NULL REFERENCES cf_models (id),
    -- "/" or "/faq/giao-hang": slugs separated by "/"
    folder_path          VARCHAR(300) NOT NULL DEFAULT '/',
    name                 VARCHAR(120) NOT NULL,
    title                VARCHAR(200) NOT NULL,
    -- The working copy
    data                 JSONB        NOT NULL DEFAULT '{}',
    model_version        INT          NOT NULL,
    status               VARCHAR(16)  NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'MODIFIED')),
    published_version_id UUID,
    -- When the current published version was published (null while DRAFT)
    published_at         TIMESTAMPTZ,
    -- Optional window in which the published version is delivered
    publish_at           TIMESTAMPTZ,
    unpublish_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by           UUID REFERENCES users (id) ON DELETE SET NULL,
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by           UUID REFERENCES users (id) ON DELETE SET NULL,
    UNIQUE (folder_path, name),
    CONSTRAINT chk_cf_fragments_data_object CHECK (jsonb_typeof(data) = 'object'),
    CONSTRAINT chk_cf_fragments_published CHECK ((status = 'DRAFT') = (published_version_id IS NULL)),
    CONSTRAINT chk_cf_fragments_window CHECK (publish_at IS NULL OR unpublish_at IS NULL OR publish_at < unpublish_at)
);

CREATE INDEX idx_cf_fragments_model ON cf_fragments (model_id, updated_at DESC);
CREATE INDEX idx_cf_fragments_folder ON cf_fragments (folder_path);

CREATE TABLE cf_fragment_versions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fragment_id   UUID         NOT NULL REFERENCES cf_fragments (id) ON DELETE CASCADE,
    version_no    INT          NOT NULL,
    title         VARCHAR(200) NOT NULL,
    data          JSONB        NOT NULL,
    model_version INT          NOT NULL,
    comment       VARCHAR(300),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by    UUID REFERENCES users (id) ON DELETE SET NULL,
    UNIQUE (fragment_id, version_no)
);

ALTER TABLE cf_fragments
    ADD CONSTRAINT fk_cf_fragments_published_version FOREIGN KEY (published_version_id)
        REFERENCES cf_fragment_versions (id) DEFERRABLE INITIALLY DEFERRED;

-- Two models ready to use
INSERT INTO cf_models (name, slug, description, status, fields) VALUES
('Câu hỏi thường gặp', 'faq', 'Một câu hỏi và câu trả lời, sắp theo thứ tự.', 'ENABLED', '[
  {"name": "question", "label": "Câu hỏi", "type": "text", "required": true, "multiple": false, "help": null, "rules": {"maxLength": 200}},
  {"name": "answer", "label": "Câu trả lời", "type": "markdown", "required": true, "multiple": false, "help": null, "rules": {}},
  {"name": "order", "label": "Thứ tự", "type": "number", "required": false, "multiple": false, "help": "Số nhỏ hiện trước", "rules": {"min": 0}}
]'),
('Banner khuyến mãi', 'promo-banner', 'Banner có ảnh, lời kêu gọi và thời gian chạy.', 'ENABLED', '[
  {"name": "headline", "label": "Tiêu đề", "type": "text", "required": true, "multiple": false, "help": null, "rules": {"maxLength": 80}},
  {"name": "subline", "label": "Dòng phụ", "type": "textarea", "required": false, "multiple": false, "help": null, "rules": {"maxLength": 200}},
  {"name": "image", "label": "Ảnh", "type": "asset", "required": true, "multiple": false, "help": null, "rules": {"allowedKinds": ["IMAGE"]}},
  {"name": "ctaLabel", "label": "Chữ trên nút", "type": "text", "required": false, "multiple": false, "help": null, "rules": {"maxLength": 30}},
  {"name": "ctaLink", "label": "Link của nút", "type": "link", "required": false, "multiple": false, "help": "Đường dẫn trong web (/san-pham) hoặc https://…", "rules": {}},
  {"name": "startsAt", "label": "Bắt đầu", "type": "datetime", "required": false, "multiple": false, "help": null, "rules": {}},
  {"name": "endsAt", "label": "Kết thúc", "type": "datetime", "required": false, "multiple": false, "help": null, "rules": {}}
]');
