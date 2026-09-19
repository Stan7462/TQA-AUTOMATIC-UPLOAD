import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const technicians = sqliteTable("technicians", {
  techId: text("tech_id").primaryKey(),
  pinSalt: text("pin_salt").notNull(),
  pinHash: text("pin_hash").notNull(),
  pinCiphertext: text("pin_ciphertext"),
  active: integer("active").notNull().default(1),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: integer("locked_until").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const techSessions = sqliteTable("tech_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  techId: text("tech_id").notNull().references(() => technicians.techId),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const technicianRemovals = sqliteTable("technician_removals", {
  techId: text("tech_id").primaryKey(),
  state: text("state").notNull().default("deleting"),
  startedAt: integer("started_at").notNull(),
});

export const qcSubmissions = sqliteTable("qc_submissions", {
  id: text("id").primaryKey(),
  techId: text("tech_id").notNull(),
  jobNumber: text("job_number").notNull().default(""),
  screenshotId: text("screenshot_id").notNull(),
  photoIds: text("photo_ids").notNull(),
  status: text("status").notNull().default("pending"),
  submittedAt: integer("submitted_at").notNull(),
  reviewedAt: integer("reviewed_at"),
  reviewNote: text("review_note"),
  trustUploadStatus: text("trust_upload_status").notNull().default("ready"),
  trustUploadedAt: integer("trust_uploaded_at"),
  trustExternalReference: text("trust_external_reference"),
  trustUploadError: text("trust_upload_error"),
  trustUploadAttempts: integer("trust_upload_attempts").notNull().default(0),
  trustLastAttemptAt: integer("trust_last_attempt_at"),
  trustUploadedByKeyId: text("trust_uploaded_by_key_id"),
}, (table) => [
  index("idx_qc_submissions_status_submitted").on(table.status, table.submittedAt),
  index("idx_qc_submissions_tech_submitted").on(table.techId, table.submittedAt),
  index("idx_qc_submissions_trust_queue").on(table.status, table.trustUploadStatus, table.reviewedAt, table.id),
]);

export const trustApiKeys = sqliteTable("trust_api_keys", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  tokenHint: text("token_hint").notNull(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
});
