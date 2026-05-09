import Link from "next/link";
import type { StaffUser } from "@/lib/auth";
import GlobalSearch from "./GlobalSearch";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Administrador",
  doctor: "Doctor",
  dispenser: "Dispensador",
  pharmacist: "Químico Farmacéutico",
};

export default function TopBar({ staff }: { staff: StaffUser }) {
  const initials = staff.full_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <header className="topbar h-14 lg:h-16 w-full fixed top-0 z-40 bg-paper/95 backdrop-blur-md border-b border-rule flex justify-between items-center px-3 sm:px-6">
      {/* Brand */}
      <Link
        href="/dashboard"
        className="font-display text-xl lg:text-2xl tracking-[-0.02em] text-ink leading-none flex items-center gap-2 ml-12 md:ml-0"
      >
        <span className="font-light">Culti</span>
        <span className="italic font-medium text-brass-dim">soft</span>
      </Link>

      <div className="flex items-center gap-3 sm:gap-5">
        <GlobalSearch />

        <div className="hidden xl:flex items-baseline gap-3 text-[11px] font-mono uppercase tracking-widest text-ink-muted">
          <span className="editorial-numeral text-base text-ink-subtle">—</span>
          <span>
            {new Date().toLocaleDateString("es-CL", {
              weekday: "long",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-2 sm:gap-3 px-2 py-1.5">
          <div className="w-7 h-7 rounded-full bg-forest text-paper flex items-center justify-center text-[11px] font-mono nums-lining">
            {initials}
          </div>
          <div className="hidden md:flex flex-col leading-tight">
            <span className="text-[12px] font-semibold text-ink truncate max-w-[140px]">
              {staff.full_name}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-ink-muted font-mono">
              {ROLE_LABELS[staff.role] || staff.role}
            </span>
          </div>
        </div>

        <Link
          href="/me"
          className="text-ink-muted hover:text-ink px-2 sm:px-3 py-1.5 text-xs uppercase tracking-widest font-mono transition-colors border-b border-transparent hover:border-ink/40"
          title="Mi cuenta"
        >
          <span className="hidden sm:inline">Mi cuenta</span>
          <span className="sm:hidden">Cuenta</span>
        </Link>

        <form action="/api/logout" method="POST">
          <button
            type="submit"
            className="text-ink-muted hover:text-ink px-2 sm:px-3 py-1.5 text-xs uppercase tracking-widest font-mono flex items-center gap-1.5 transition-colors border-b border-transparent hover:border-ink/40"
            title="Cerrar sesión"
          >
            <span className="hidden sm:inline">Salir</span>
            <span aria-hidden>→</span>
          </button>
        </form>
      </div>
    </header>
  );
}
