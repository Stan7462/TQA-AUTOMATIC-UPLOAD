ALTER TABLE "qc_submissions" ADD COLUMN "location_status" TEXT;
ALTER TABLE "qc_submissions" ADD COLUMN "location_latitude" REAL;
ALTER TABLE "qc_submissions" ADD COLUMN "location_longitude" REAL;
ALTER TABLE "qc_submissions" ADD COLUMN "location_accuracy" REAL;
ALTER TABLE "qc_submissions" ADD COLUMN "location_captured_at" BIGINT;

INSERT OR IGNORE INTO "local_migrations" ("name") VALUES ('0007_qc_location.sql');
