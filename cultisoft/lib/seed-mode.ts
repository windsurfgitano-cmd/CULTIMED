import { get } from "./db";

/**
 * Heuristic to determine if the current DB is in DEMO mode (has synthetic
 * transactional data) vs CLEAN production data.
 *
 * Strategy: count how many dispensations / prescriptions exist with no
 * `audit_logs` referring to them. Synthetic seed data has zero audit entries
 * because the seed bypasses the regular API path. Real-app-created data always
 * generates an audit log entry.
 */
export function isDemoMode(): boolean {
  const dispCount = get<{ c: number }>(`SELECT COUNT(*) as c FROM dispensations`)?.c ?? 0;
  if (dispCount === 0) return false; // empty DB or clean seed → not "demo"
  const auditCount = get<{ c: number }>(
    `SELECT COUNT(*) as c FROM audit_logs WHERE entity_type = 'dispensation'`
  )?.c ?? 0;
  // If we have dispensations but virtually no audit entries → seed-generated
  return auditCount < dispCount * 0.5;
}
