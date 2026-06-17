-- backend/migrations/0001_create_settings.sql
-- Shared with the main registration Worker's D1 database. IF NOT EXISTS makes
-- this safe to run even if the registration form's repo created this table.

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO settings (key, value)
VALUES ('registration_open', 'true')
ON CONFLICT(key) DO NOTHING;
