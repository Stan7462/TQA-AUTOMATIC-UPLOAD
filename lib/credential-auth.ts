import { equalHex, hashPin } from "@/lib/tech-auth";

export type CredentialCandidate = {
  tenantId: string;
  tenantName: string;
  techId: string;
  salt: string;
  hash: string;
  isAdmin: number;
  mustSetup: number;
  lockedUntil: number;
};

export async function credentialCandidates(
  db: typeof import("@/lib/local-env").DB,
  techId: string,
  credential: string,
  adminsOnly = false,
): Promise<{ candidates: CredentialCandidate[]; matches: CredentialCandidate[] }> {
  const result = await db.prepare(
    "SELECT t.tenant_id AS tenantId, n.name AS tenantName, t.tech_id AS techId, t.pin_salt AS salt, t.pin_hash AS hash, t.is_admin AS isAdmin, t.must_change_credentials AS mustSetup, t.locked_until AS lockedUntil FROM technicians t JOIN tenants n ON n.id = t.tenant_id WHERE t.tech_id = ? AND t.active = 1 AND n.active = 1" + (adminsOnly ? " AND t.is_admin = 1" : "")
  ).bind(techId).all<CredentialCandidate>();
  const now = Date.now();
  const matches: CredentialCandidate[] = [];
  for (const candidate of result.results) {
    if (candidate.lockedUntil > now) continue;
    if (equalHex(await hashPin(credential, candidate.salt), candidate.hash)) matches.push(candidate);
  }
  return { candidates: result.results, matches };
}

export async function uniqueTechnicianPin(
  db: typeof import("@/lib/local-env").DB,
  techId: string,
  makePin: () => string,
): Promise<string> {
  const existing = await db.prepare("SELECT pin_salt AS salt, pin_hash AS hash FROM technicians WHERE tech_id = ?").bind(techId).all<{ salt: string; hash: string }>();
  for (let attempt = 0; attempt < 100; attempt++) {
    const pin = makePin();
    let duplicate = false;
    for (const row of existing.results) {
      if (equalHex(await hashPin(pin, row.salt), row.hash)) { duplicate = true; break; }
    }
    if (!duplicate) return pin;
  }
  throw new Error("Could not generate a unique technician PIN.");
}
