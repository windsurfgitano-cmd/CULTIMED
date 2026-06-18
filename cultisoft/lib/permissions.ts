import type { StaffRole } from "./auth";

/** Rutas del sidebar y roles que pueden verlas. */
export const NAV_ACCESS: Record<string, StaffRole[]> = {
  "/dashboard":         ["superadmin", "admin", "doctor", "pharmacist", "dispenser"],
  "/patients":          ["superadmin", "admin", "doctor", "pharmacist", "dispenser"],
  "/dispensations":     ["superadmin", "admin", "pharmacist", "dispenser"],
  "/web-orders":        ["superadmin", "admin", "pharmacist", "dispenser"],
  "/prescriptions":     ["superadmin", "admin", "doctor", "pharmacist"],
  "/web-prescriptions": ["superadmin", "admin", "doctor", "pharmacist"],
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