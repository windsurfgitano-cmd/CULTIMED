"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useCart } from "@/lib/cart";
import clsx from "clsx";

interface HeaderProps {
  customer: { full_name: string | null; email: string } | null;
}

export default function Header({ customer }: HeaderProps) {
  const pathname = usePathname();
  const { count } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      <header
        className={clsx(
          "fixed top-0 inset-x-0 z-40 transition-all duration-500 ease-editorial",
          scrolled
            ? "bg-paper/90 backdrop-blur-md border-b border-rule"
            : "bg-transparent"
        )}
      >
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 h-16 lg:h-20 flex items-center justify-between">
          <Link href="/" className="font-display text-xl lg:text-2xl tracking-[-0.02em] text-ink leading-none">
            <span className="font-light">Culti</span><span className="italic font-medium">med</span>
          </Link>

          <nav className="hidden lg:flex items-center gap-10 text-sm">
            {[
              { href: "/productos", label: "Catálogo" },
              { href: "/consulta", label: "Consulta médica" },
              { href: "/trazabilidad", label: "Trazabilidad" },
              { href: "/compliance", label: "Compliance" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(
                  "relative tracking-editorial transition-colors duration-300",
                  pathname?.startsWith(l.href) ? "text-ink" : "text-ink-muted hover:text-ink"
                )}
              >
                {l.label}
                {pathname?.startsWith(l.href) && (
                  <span className="absolute -bottom-1.5 left-0 right-0 h-px bg-ink" />
                )}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 lg:gap-5">
            {customer ? (
              <Link href="/mi-cuenta" className="hidden sm:flex items-center gap-2 text-sm tracking-editorial text-ink-muted hover:text-ink transition-colors">
                <span className="hidden md:inline">{customer.full_name?.split(" ")[0] || customer.email.split("@")[0]}</span>
                <CircleIcon />
              </Link>
            ) : (
              <Link href="/ingresar" className="hidden sm:inline text-sm tracking-editorial text-ink-muted hover:text-ink transition-colors">
                Ingresar
              </Link>
            )}

            <Link href="/carrito" className="relative inline-flex items-center gap-2 text-sm tracking-editorial text-ink-muted hover:text-ink transition-colors">
              <span className="hidden sm:inline">Carrito</span>
              <span className="font-mono nums-lining">[{count}]</span>
            </Link>

            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Menu"
              className="lg:hidden ml-2 w-9 h-9 flex flex-col items-center justify-center gap-1.5"
            >
              <span className={clsx(
                "block h-px w-5 bg-ink transition-transform duration-300",
                mobileOpen && "translate-y-[3px] rotate-45"
              )} />
              <span className={clsx(
                "block h-px w-5 bg-ink transition-transform duration-300",
                mobileOpen && "-translate-y-[3px] -rotate-45"
              )} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        className={clsx(
          "fixed inset-0 z-30 lg:hidden transition-all duration-500 ease-editorial",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={clsx(
            "absolute inset-0 bg-ink/30 transition-opacity duration-500",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
        />
        <aside
          className={clsx(
            "absolute right-0 top-0 bottom-0 w-[85%] max-w-sm bg-paper-bright transition-transform duration-500 ease-editorial flex flex-col",
            mobileOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="h-16 flex items-center px-6 border-b border-rule">
            <span className="font-display text-xl">
              <span className="font-light">Culti</span><span className="italic font-medium">med</span>
            </span>
          </div>
          <nav className="flex-1 px-6 py-8 space-y-1">
            {[
              { href: "/productos", label: "Catálogo", n: "01" },
              { href: "/consulta", label: "Consulta médica", n: "02" },
              { href: "/trazabilidad", label: "Trazabilidad", n: "03" },
              { href: "/compliance", label: "Compliance", n: "04" },
              { href: customer ? "/mi-cuenta" : "/ingresar", label: customer ? "Mi cuenta" : "Ingresar", n: "05" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-baseline gap-4 py-4 border-b border-rule-soft group"
              >
                <span className="editorial-numeral text-sm text-ink-muted">{l.n}</span>
                <span className="font-display text-2xl text-ink group-hover:italic transition-all">{l.label}</span>
              </Link>
            ))}
          </nav>
        </aside>
      </div>
    </>
  );
}

function CircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9.25" stroke="currentColor" strokeWidth="0.75" />
      <circle cx="10" cy="8" r="3" stroke="currentColor" strokeWidth="0.75" />
      <path d="M3 17C4 13 7 11 10 11C13 11 16 13 17 17" stroke="currentColor" strokeWidth="0.75" />
    </svg>
  );
}
