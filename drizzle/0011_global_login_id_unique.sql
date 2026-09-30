DROP INDEX IF EXISTS idx_technicians_global_tech_id;
DROP INDEX IF EXISTS technicians_tech_id_key;
DROP INDEX IF EXISTS technicians_credential_fingerprint_key;

CREATE INDEX idx_technicians_global_tech_id ON technicians(tech_id);
CREATE UNIQUE INDEX technicians_admin_credential_fingerprint_key
  ON technicians(credential_fingerprint)
  WHERE is_admin = 1 AND credential_fingerprint IS NOT NULL;
CREATE UNIQUE INDEX technicians_tech_login_key
  ON technicians(tech_id, credential_fingerprint)
  WHERE is_admin = 0 AND credential_fingerprint IS NOT NULL;

DROP TRIGGER IF EXISTS technicians_login_id_insert_guard;
DROP TRIGGER IF EXISTS technicians_login_id_update_guard;

CREATE TRIGGER technicians_login_id_insert_guard
BEFORE INSERT ON technicians
WHEN EXISTS (
  SELECT 1 FROM technicians existing
  WHERE existing.tech_id = NEW.tech_id
    AND (NEW.is_admin = 1 OR existing.is_admin = 1)
)
BEGIN
  SELECT RAISE(ABORT, 'LOGIN_ID_NOT_AVAILABLE');
END;

CREATE TRIGGER technicians_login_id_update_guard
BEFORE UPDATE OF tech_id, is_admin ON technicians
WHEN EXISTS (
  SELECT 1 FROM technicians existing
  WHERE existing.rowid <> OLD.rowid
    AND existing.tech_id = NEW.tech_id
    AND (NEW.is_admin = 1 OR existing.is_admin = 1)
)
BEGIN
  SELECT RAISE(ABORT, 'LOGIN_ID_NOT_AVAILABLE');
END;
