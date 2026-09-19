-- CreateTable
CREATE TABLE "technicians" (
    "tech_id" TEXT NOT NULL PRIMARY KEY,
    "pin_salt" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "pin_ciphertext" TEXT,
    "active" INTEGER NOT NULL DEFAULT 1,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" BIGINT NOT NULL DEFAULT 0,
    "created_at" BIGINT NOT NULL
);

-- CreateTable
CREATE TABLE "tech_sessions" (
    "token_hash" TEXT NOT NULL PRIMARY KEY,
    "tech_id" TEXT NOT NULL,
    "expires_at" BIGINT NOT NULL,
    "created_at" BIGINT NOT NULL,
    CONSTRAINT "tech_sessions_tech_id_fkey" FOREIGN KEY ("tech_id") REFERENCES "technicians" ("tech_id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "technician_removals" (
    "tech_id" TEXT NOT NULL PRIMARY KEY,
    "state" TEXT NOT NULL DEFAULT 'deleting',
    "started_at" BIGINT NOT NULL
);

-- CreateTable
CREATE TABLE "qc_submissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tech_id" TEXT NOT NULL,
    "job_number" TEXT NOT NULL DEFAULT '',
    "screenshot_id" TEXT NOT NULL,
    "photo_ids" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submitted_at" BIGINT NOT NULL,
    "reviewed_at" BIGINT,
    "review_note" TEXT,
    "trust_upload_status" TEXT NOT NULL DEFAULT 'ready',
    "trust_uploaded_at" BIGINT,
    "trust_external_reference" TEXT,
    "trust_upload_error" TEXT,
    "trust_upload_attempts" INTEGER NOT NULL DEFAULT 0,
    "trust_last_attempt_at" BIGINT,
    "trust_uploaded_by_key_id" TEXT
);

-- CreateTable
CREATE TABLE "qc_upload_photos" (
    "submission_id" TEXT NOT NULL,
    "tech_id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "image" BLOB NOT NULL,
    "created_at" BIGINT NOT NULL,

    PRIMARY KEY ("submission_id", "tech_id", "slot")
);

-- CreateTable
CREATE TABLE "trust_api_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_hint" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,
    "last_used_at" BIGINT,
    "revoked_at" BIGINT
);

-- CreateTable
CREATE TABLE "local_migrations" (
    "name" TEXT NOT NULL PRIMARY KEY
);

-- CreateIndex
CREATE INDEX "idx_qc_submissions_status_submitted" ON "qc_submissions"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "idx_qc_submissions_tech_submitted" ON "qc_submissions"("tech_id", "submitted_at");

-- CreateIndex
CREATE INDEX "idx_qc_submissions_trust_queue" ON "qc_submissions"("status", "trust_upload_status", "reviewed_at", "id");

-- CreateIndex
CREATE INDEX "qc_upload_photos_created_at_idx" ON "qc_upload_photos"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "trust_api_keys_token_hash_key" ON "trust_api_keys"("token_hash");


-- Preserve compatibility with the original runtime migration ledger.
INSERT INTO "local_migrations" ("name") VALUES
  ('0000_warm_rawhide_kid.sql'),
  ('0001_first_wolverine.sql'),
  ('0002_abandoned_amphibian.sql'),
  ('0003_freezing_vulture.sql'),
  ('0004_crazy_killraven.sql'),
  ('0005_qc_upload_photos.sql'),
  ('0006_trust_integration.sql');
