"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import clsx from "clsx";

const NAV = [
  { n: "01", href: "/dashboard",         label: "Dashboard" },
  { n: "02", href: "/patients",          label: "Pacientes" },
  { n: "03", href: "/dispensations",     label: "Dispensaciones" },
  { n: "04", href: "/web-orders",        label: "Pedidos web" },
  { n: "05", href: "/prescriptions",     label: "Recetas" },
  { n: "06", href: "/web-prescriptions", label: "Recetas web" },
  { n: "07", href: "/inventory",         label: "Inventario" },
  { n: "08", href: "/reports",           label: "Reportes" },
  { n: "09", href: "/ambassadors",       label: "Embajadores" },
];

const SYSTEM = [
  { n: "10", href: "/admin", label: "Super Admin", adminOnly: true },
];

function NavList({ role, onNav }: { role: string; onNav?: () => void }) {
  const pathname = usePathname() || "";
  return (
    <nav className="flex flex-col py-6">
      <p className="px-6 mb-3 eyebrow text-ink-subtle">— Operación</p>

      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNav}
            className={clsx(
              "group flex items-baseline gap-4 px-6 py-2.5 transition-colors duration-200 border-l-2",
              active
                ? "bg-paper-bright border-ink text-ink"
                : "border-transparent text-ink-muted hover:text-ink hover:bg-paper-bright/50"
            )}
          >
            <span
              className={clsx(
                "editorial-numeral text-xs w-7 shrink-0 transition-colors",
                active ? "text-brass" : "text-ink-subtle group-hover:text-brass-dim"
              )}
            >
              {item.n}
            </span>
            <span className={clsx(
              "font-display tracking-tight",
              active ? "text-base italic" : "text-base"
            )}>
              {item.label}
            </span>
          </Link>
        );
      })}

      {SYSTEM.filter((i) => !i.adminOnly || role === "superadmin").length > 0 && (
        <>
          <p className="mt-8 px-6 mb-3 eyebrow text-ink-subtle">— Sistema</p>
          {SYSTEM.filter((i) => !i.adminOnly || role === "superadmin").map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNav}
                className={clsx(
                  "group flex items-baseline gap-4 px-6 py-2.5 transition-colors duration-200 border-l-2",
                  active
                    ? "bg-paper-bright border-ink text-ink"
                    : "border-transparent text-ink-muted hover:text-ink hover:bg-paper-bright/50"
                )}
              >
                <span className={clsx(
                  "editorial-numeral text-xs w-7 shrink-0 transition-colors",
                  active ? "text-brass" : "text-ink-subtle group-hover:text-brass-dim"
                )}>{item.n}</span>
                <span className={clsx("font-display tracking-tight", active ? "text-base italic" : "text-base")}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </>
      )}
    </nav>
  );
}

export default function Sidebar({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label="Abrir menú"
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 bg-paper-bright border border-rule flex items-center justify-center text-ink"
      >
        <span className="material-symbols-outlined">menu</span>
      </button>

      {/* Desktop sidebar */}
      <aside className="sidebar-desktop w-[260px] h-screen fixed left-0 top-0 pt-16 bg-paper-dim/40 border-r border-rule hidden md:flex md:flex-col z-30">
        <NavList role={role} />
        <div className="mt-auto px-6 py-5 border-t border-rule-soft">
          <p className="editorial-numeral text-xs text-ink-subtle">— v1.0</p>
          <p className="text-[10px] uppercase tracking-widest text-ink-subtle font-mono mt-1">
            Modo local · MVP
          </p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-ink/30 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="fixed left-0 top-0 bottom-0 z-50 w-[280px] bg-paper-bright shadow-editorial md:hidden flex flex-col animate-fade-in">
            <div className="h-14 flex items-center justify-between px-5 border-b border-rule">
              <Link href="/dashboard" className="font-display text-xl text-ink leading-none">
                <span className="font-light">Culti</span>
                <span className="italic text-brass-dim">soft</span>
              </Link>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
                className="w-9 h-9 hover:bg-paper-dim flex items-center justify-center text-ink-muted"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <NavList role={role} onNav={() => setOpen(false)} />
            <div className="mt-auto px-6 py-5 border-t border-rule-soft">
              <p className="editorial-numeral text-xs text-ink-subtle">— v1.0</p>
              <p className="text-[10px] uppercase tracking-widest text-ink-subtle font-mono mt-1">
                Modo local · MVP
              </p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
