import type { StaffRole } from "./auth";

/** Acceso operativo: dispensaciones, pedidos web, inventario, productos. */
export const OPS_ROLES: StaffRole[] = ["admin", "superadmin", "pharmacist", "dispenser"];

/** Pacientes: incluye médicos (solo clínica, sin inventario/pedidos). */
export const PATIENTS_ROLES: StaffRole[] = ["admin", "superadmin", "doctor", "pharmacist", "dispenser"];

/** Recetas internas y recetas web. */
export const PRESCRIPTIONS_ROLES: StaffRole[] = ["admin", "superadmin", "doctor", "pharmacist"];

/** Rutas del sidebar y roles que pueden verlas. */
export const NAV_ACCESS: Record<string, StaffRole[]> = {
  "/dashboard":         PATIENTS_ROLES,
  "/patients":          PATIENTS_ROLES,
  "/dispensations":     OPS_ROLES,
  "/web-orders":        OPS_ROLES,
  "/prescriptions":     PRESCRIPTIONS_ROLES,
  "/web-prescriptions": PRESCRIPTIONS_ROLES,
  "/products":          ["superadmin", "admin", "pharmacist"],
  "/inventory":         ["superadmin", "admin", "pharmacist"],
  "/reports":           ["superadmin", "admin"],
  "/ambassadors":       ["superadmin", "admin"],
  "/admin":             ["superadmin"],
};

export function canAccessNav(role: StaffRole, href: string): boolean {
  const allowed = NAV_ACCESS[href];
  if (!allowed) return true;
  return allowed.includes(role);
}