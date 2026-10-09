CREATE TABLE tenants (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  active BIGINT NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL
, monthly_qc_goal BIGINT NOT NULL DEFAULT 5);

CREATE TABLE technicians (
  tenant_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_ciphertext TEXT,
  active BIGINT NOT NULL DEFAULT 1,
  is_admin BIGINT NOT NULL DEFAULT 0,
  failed_attempts BIGINT NOT NULL DEFAULT 0,
  locked_until BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL, must_change_credentials BIGINT NOT NULL DEFAULT 0, credential_fingerprint TEXT, monthly_qc_goal BIGINT CHECK (monthly_qc_goal BETWEEN 1 AND 99),
  PRIMARY KEY (tenant_id, tech_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE tech_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (tenant_id, tech_id) REFERENCES technicians(tenant_id, tech_id) ON DELETE CASCADE
);

CREATE TABLE technician_removals (
  tenant_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'deleting',
  started_at BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, tech_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE "qc_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"tech_id" text NOT NULL,
	"screenshot_id" text NOT NULL,
	"photo_ids" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" BIGINT NOT NULL,
	"reviewed_at" BIGINT
, "job_number" text DEFAULT '' NOT NULL, "review_note" text, trust_upload_status TEXT NOT NULL DEFAULT 'ready', trust_uploaded_at BIGINT, trust_external_reference TEXT, trust_upload_error TEXT, trust_upload_attempts BIGINT NOT NULL DEFAULT 0, trust_last_attempt_at BIGINT, trust_uploaded_by_key_id TEXT, location_status TEXT, location_latitude DOUBLE PRECISION, location_longitude DOUBLE PRECISION, location_accuracy DOUBLE PRECISION, location_captured_at BIGINT, tenant_id TEXT NOT NULL DEFAULT 'default', root_submission_id TEXT, attempt_number BIGINT NOT NULL DEFAULT 1, correction_pending BIGINT NOT NULL DEFAULT 0, correction_deadline_at BIGINT);

CREATE TABLE qc_submission_attempts (
  tenant_id TEXT NOT NULL,
  root_submission_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  attempt_number BIGINT NOT NULL,
  tech_id TEXT NOT NULL,
  job_number TEXT NOT NULL,
  screenshot_id TEXT NOT NULL,
  photo_ids TEXT NOT NULL,
  status TEXT NOT NULL,
  submitted_at BIGINT NOT NULL,
  reviewed_at BIGINT,
  review_note TEXT,
  trust_upload_status TEXT NOT NULL DEFAULT 'ready',
  trust_uploaded_at BIGINT,
  trust_external_reference TEXT,
  trust_upload_error TEXT,
  trust_upload_attempts BIGINT NOT NULL DEFAULT 0,
  trust_last_attempt_at BIGINT,
  trust_uploaded_by_key_id TEXT,
  location_status TEXT,
  location_latitude DOUBLE PRECISION,
  location_longitude DOUBLE PRECISION,
  location_accuracy DOUBLE PRECISION,
  location_captured_at BIGINT,
  PRIMARY KEY (tenant_id, root_submission_id, attempt_number)
);

CREATE TABLE qc_upload_photos (
  tenant_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  slot BIGINT NOT NULL,
  image BYTEA NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, submission_id, tech_id, slot),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE trust_api_keys (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  last_used_at BIGINT,
  revoked_at BIGINT
, tenant_id TEXT NOT NULL DEFAULT 'default');

CREATE TABLE tenant_domains (
  hostname TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE push_accounts (
  tenant_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  external_id TEXT NOT NULL UNIQUE,
  enabled BIGINT NOT NULL DEFAULT 0,
  rejected BIGINT NOT NULL DEFAULT 1,
  deadline BIGINT NOT NULL DEFAULT 1,
  overdue BIGINT NOT NULL DEFAULT 1,
  monthly BIGINT NOT NULL DEFAULT 1,
  enabled_at BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, tech_id),
  FOREIGN KEY (tenant_id, tech_id) REFERENCES technicians(tenant_id, tech_id) ON DELETE CASCADE
);

CREATE TABLE push_company_preferences (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  rejected BIGINT NOT NULL DEFAULT 1,
  deadline BIGINT NOT NULL DEFAULT 1,
  overdue BIGINT NOT NULL DEFAULT 1,
  monthly BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE push_watches (
  tenant_id TEXT NOT NULL,
  supervisor_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  enabled_at BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, supervisor_id, tech_id),
  FOREIGN KEY (tenant_id, supervisor_id) REFERENCES technicians(tenant_id, tech_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, tech_id) REFERENCES technicians(tenant_id, tech_id) ON DELETE CASCADE
);

CREATE TABLE push_outbox (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  submission_id TEXT,
  revision BIGINT,
  message TEXT NOT NULL,
  url TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  attempts BIGINT NOT NULL DEFAULT 0,
  next_attempt_at BIGINT NOT NULL DEFAULT 0,
  sent_at BIGINT,
  last_error TEXT,
  FOREIGN KEY (tenant_id, tech_id) REFERENCES technicians(tenant_id, tech_id) ON DELETE CASCADE
);

CREATE TABLE local_migrations (name TEXT PRIMARY KEY);

CREATE UNIQUE INDEX idx_admin_credential_fingerprint ON technicians(credential_fingerprint) WHERE is_admin = 1 AND credential_fingerprint IS NOT NULL;
CREATE INDEX idx_push_outbox_due ON push_outbox(sent_at, next_attempt_at);
CREATE INDEX idx_qc_submission_attempts_root
  ON qc_submission_attempts(tenant_id, root_submission_id, attempt_number);
CREATE INDEX idx_qc_submission_attempts_submitted
  ON qc_submission_attempts(tenant_id, submitted_at);
CREATE INDEX "idx_qc_submissions_status_submitted" ON "qc_submissions" ("status","submitted_at");
CREATE INDEX "idx_qc_submissions_tech_submitted" ON "qc_submissions" ("tech_id","submitted_at");
CREATE INDEX idx_qc_submissions_tenant_corrections
  ON qc_submissions(tenant_id, status, correction_pending, submitted_at);
CREATE INDEX idx_qc_submissions_tenant_status ON qc_submissions(tenant_id, status, submitted_at);
CREATE INDEX idx_qc_submissions_tenant_tech ON qc_submissions(tenant_id, tech_id, submitted_at);
CREATE INDEX idx_qc_submissions_tenant_trust ON qc_submissions(tenant_id, status, trust_upload_status, reviewed_at, id);
CREATE INDEX idx_qc_submissions_trust_queue ON qc_submissions (status, trust_upload_status, reviewed_at, id);
CREATE INDEX idx_qc_upload_photos_tenant_created ON qc_upload_photos(tenant_id, created_at);
CREATE INDEX idx_sessions_tenant_tech ON tech_sessions(tenant_id, tech_id);
CREATE INDEX idx_technicians_global_tech_id ON technicians(tech_id);
CREATE INDEX idx_technicians_tenant_active ON technicians(tenant_id, active, tech_id);
CREATE INDEX idx_trust_api_keys_tenant ON trust_api_keys(tenant_id, revoked_at, created_at);
CREATE UNIQUE INDEX technicians_admin_credential_fingerprint_key
  ON technicians(credential_fingerprint)
  WHERE is_admin = 1 AND credential_fingerprint IS NOT NULL;
CREATE UNIQUE INDEX technicians_tech_login_key
  ON technicians(tech_id, credential_fingerprint)
  WHERE is_admin = 0 AND credential_fingerprint IS NOT NULL;
-- Reserve login IDs transactionally: many technicians may share an ID,
-- but a supervisor ID may not be shared with any other account.
CREATE TABLE login_id_claims (
  tech_id TEXT PRIMARY KEY,
  technician_count BIGINT NOT NULL DEFAULT 0,
  admin_count BIGINT NOT NULL DEFAULT 0,
  CHECK (technician_count >= 0 AND admin_count >= 0),
  CHECK (admin_count <= 1 AND (admin_count = 0 OR technician_count = 0))
);
CREATE FUNCTION maintain_login_id_claim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.tech_id = NEW.tech_id AND OLD.is_admin = NEW.is_admin THEN
    RETURN NEW;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    UPDATE login_id_claims SET technician_count=technician_count-CASE WHEN OLD.is_admin=0 THEN 1 ELSE 0 END,
      admin_count=admin_count-CASE WHEN OLD.is_admin=1 THEN 1 ELSE 0 END WHERE tech_id=OLD.tech_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    BEGIN
      INSERT INTO login_id_claims(tech_id,technician_count,admin_count)
      VALUES(NEW.tech_id,CASE WHEN NEW.is_admin=0 THEN 1 ELSE 0 END,CASE WHEN NEW.is_admin=1 THEN 1 ELSE 0 END)
      ON CONFLICT(tech_id) DO UPDATE SET technician_count=login_id_claims.technician_count+EXCLUDED.technician_count,
        admin_count=login_id_claims.admin_count+EXCLUDED.admin_count;
    EXCEPTION WHEN check_violation THEN
      RAISE EXCEPTION 'LOGIN_ID_NOT_AVAILABLE' USING ERRCODE='23505';
    END;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER technicians_login_guard AFTER INSERT OR UPDATE OR DELETE ON technicians
  FOR EACH ROW EXECUTE FUNCTION maintain_login_id_claim();
