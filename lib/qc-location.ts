export type QcLocation =
  | { status: "verified"; latitude: number; longitude: number; accuracy: number; capturedAt: number }
  | { status: "unavailable"; capturedAt: number };

export function normalizeQcLocation(value: unknown): QcLocation | null {
  if (!value || typeof value !== "object") return null;
  const location = value as Record<string, unknown>;
  if (!Number.isSafeInteger(location.capturedAt) || (location.capturedAt as number) <= 0) return null;
  if (location.status === "unavailable") return { status: "unavailable", capturedAt: location.capturedAt as number };
  if (location.status !== "verified" || typeof location.latitude !== "number" || !Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90 ||
      typeof location.longitude !== "number" || !Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180 ||
      typeof location.accuracy !== "number" || !Number.isFinite(location.accuracy) || location.accuracy < 0 || location.accuracy > 100_000) return null;
  return {
    status: "verified",
    latitude: Math.round(location.latitude * 1_000_000) / 1_000_000,
    longitude: Math.round(location.longitude * 1_000_000) / 1_000_000,
    accuracy: Math.round(location.accuracy),
    capturedAt: location.capturedAt as number,
  };
}
