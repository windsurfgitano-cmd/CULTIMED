/** Only allow same-origin relative paths (blocks open redirects). */
export function safeRedirectPath(next: string | null | undefined, fallback = "/mi-cuenta"): string {
  const raw = (next || "").trim();
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("://")) return fallback;
  return raw;
}