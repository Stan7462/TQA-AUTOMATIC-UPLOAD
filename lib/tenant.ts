export type Tenant = { id: string; name: string; hostname: string };

export function requestHostname(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const value = forwarded || request.headers.get("host") || new URL(request.url).host;
  return value.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export async function getRequestTenant(request: Request, db: typeof import("@/lib/local-env").DB): Promise<Tenant | null> {
  const hostname = requestHostname(request);
  return db.prepare("SELECT t.id, t.name, d.hostname FROM tenant_domains d JOIN tenants t ON t.id = d.tenant_id WHERE d.hostname = ? AND t.active = 1")
    .bind(hostname).first<Tenant>();
}

export function tenantUnavailable(): Response {
  return Response.json({ error: "This TQA domain is not configured." }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
