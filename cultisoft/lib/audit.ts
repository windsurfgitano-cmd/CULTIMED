import { run } from "./db";

export async function logAudit(opts: {
  staffId?: number | null;
  action: string;
  entityType?: string;
  entityId?: number;
  details?: Record<string, any>;
}): Promise<void> {
  await run(
    `INSERT INTO audit_logs (staff_id, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    opts.staffId ?? null,
    opts.action,
    opts.entityType ?? null,
    opts.entityId ?? null,
    opts.details ? JSON.stringify(opts.details) : null
  );
}

export function nextFolio(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${prefix}-${ts}${rand}`;
}
