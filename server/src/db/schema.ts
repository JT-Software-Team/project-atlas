/**
 * Versioned schema migrations. Append new entries; never edit an applied one.
 * Each migration runs inside a transaction; the applied version is recorded in the schema_version table.
 */
export const migrations: string[] = [
  /* 1 — initial schema */ `
  CREATE TABLE clients (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    is_placeholder INTEGER NOT NULL DEFAULT 0,
    industry TEXT,
    website TEXT,
    location TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    site_name TEXT,
    internal_ref TEXT,
    logo_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin','project_admin','viewer')),
    password_hash TEXT,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    remember INTEGER NOT NULL DEFAULT 0,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE password_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('reset','invite')),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE media (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('image','document')),
    stored_name TEXT NOT NULL UNIQUE,
    thumb_name TEXT,
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    short_description TEXT,
    description TEXT,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    project_type TEXT,
    status TEXT NOT NULL DEFAULT 'planning'
      CHECK (status IN ('planning','active','completed','on_hold','under_maintenance','archived')),
    start_date TEXT,
    completion_date TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    featured INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,

    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    site_name TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    location_approved INTEGER NOT NULL DEFAULT 0,

    cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    plant_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    equipment_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    document_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,

    technical TEXT NOT NULL DEFAULT '{}',

    owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    responsible_team TEXT,
    authorized_roles TEXT NOT NULL DEFAULT '[]',
    client_access INTEGER NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'restricted' CHECK (visibility IN ('private','restricted','public_overview')),
    public_approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    public_approved_at TEXT,
    internal_notes TEXT,
    approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','pending_review','approved')),
    contact_approved INTEGER NOT NULL DEFAULT 0,

    maintenance_notes TEXT,
    last_maintenance_date TEXT,
    next_maintenance_date TEXT,
    support_contact TEXT,
    review_date TEXT,
    decommission_date TEXT,

    status_before_archive TEXT,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX projects_client ON projects(client_id);

  CREATE TABLE project_gallery (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    caption TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, media_id)
  );

  CREATE TABLE dashboards (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'custom',
    description TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    open_in TEXT NOT NULL DEFAULT 'new_tab' CHECK (open_in IN ('new_tab','same_tab')),
    thumbnail_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    provider TEXT,
    requires_separate_login INTEGER NOT NULL DEFAULT 1,
    last_verified_at TEXT,
    last_verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    check_result TEXT,
    check_detail TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX dashboards_project ON dashboards(project_id);

  CREATE TABLE project_access (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level TEXT NOT NULL CHECK (level IN ('view','technical','manage')),
    granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    granted_at TEXT NOT NULL,
    PRIMARY KEY (project_id, user_id)
  );

  CREATE TABLE favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, project_id)
  );

  CREATE TABLE recent_access (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    accessed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, project_id)
  );

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    project_id INTEGER,
    summary TEXT NOT NULL,
    ip TEXT
  );
  CREATE INDEX audit_at ON audit_log(at);
  CREATE INDEX audit_project ON audit_log(project_id);
  `,
  /* 2 — accounts provisioned with an initial password must choose a new one at first sign-in */ `
  ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
  `,
  /* 3 — file contents live in the database so every server instance sees the same uploads */ `
  CREATE TABLE media_files (
    name TEXT PRIMARY KEY,
    data BLOB NOT NULL
  );
  `,
];
