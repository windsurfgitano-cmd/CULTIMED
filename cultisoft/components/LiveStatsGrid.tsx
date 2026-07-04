"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { formatCLP } from "@/lib/format";
import type { DashboardCounts } from "@/lib/dashboard-counts";

const POLL_MS = 30_000;

type Tone = "neutral" | "warning" | "error" | "success";

interface CardDef {
  numeral: string;
  label: string;
  href: string;
  getValue: (c: DashboardCounts) => number;
  getDelta?: (c: DashboardCounts) => string | null;
  /** Tono cuando el valor es > 0. En 0 siempre se muestra "success" (al día). */
  severity: Tone;
}

const CARDS: CardDef[] = [
  {
    numeral: "01", label: "Pacientes activos", href: "/patients",
    getValue: (c) => c.patientsActive,
    getDelta: (c) => (c.newPatientsThisMonth > 0 ? `+${c.newPatientsThisMonth} este mes` : null),
    severity: "neutral",
  },
  {
    numeral: "02", label: "Pedidos web hoy", href: "/web-orders",
    getValue: (c) => c.todayWebOrders,
    getDelta: (c) => (c.todayWebRevenue > 0 ? formatCLP(c.todayWebRevenue) : null),
    severity: "neutral",
  },
  {
    numeral: "03", label: "QF pendiente", href: "/web-prescriptions?status=pending",
    getValue: (c) => c.pendingWebRx,
    severity: "error",
  },
  {
    numeral: "04", label: "Pedidos por gestionar", href: "/web-orders",
    getValue: (c) => c.pendingWebOrders,
    severity: "warning",
  },
  {
    numeral: "05", label: "Pedidos abandonados", href: "/web-orders?status=pending_payment",
    getValue: (c) => c.abandonedWebOrders,
    severity: "neutral",
  },
  {
    numeral: "06", label: "Stock bajo", href: "/inventory?filter=low",
    getValue: (c) => c.totalLowStock,
    severity: "error",
  },
  {
    numeral: "07", label: "Por vencer (60 días)", href: "/inventory?filter=expiring",
    getValue: (c) => c.totalExpiringSoon,
    severity: "warning",
  },
  {
    numeral: "08", label: "Recetas pendientes", href: "/prescriptions?status=pending",
    getValue: (c) => c.pendingRx,
    severity: "warning",
  },
];

const TONE_BORDER: Record<Tone, string> = {
  neutral: "border-ink-subtle",
  warning: "border-brass",
  error: "border-sangria",
  success: "border-forest",
};
const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-ink",
  warning: "text-brass-dim",
  error: "text-sangria",
  success: "text-forest",
};

function StatCard({ def, counts, prevValue }: { def: CardDef; counts: DashboardCounts; prevValue: number }) {
  const value = def.getValue(counts);
  const delta = def.getDelta?.(counts) ?? null;
  const tone: Tone = value > 0 ? def.severity : "success";
  const numRef = useRef<HTMLParagraphElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const displayed = useRef(value);

  useEffect(() => {
    const el = numRef.current;
    if (!el) return;
    const obj = { val: displayed.current };
    gsap.to(obj, {
      val: value,
      duration: 0.7,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = Math.round(obj.val).toLocaleString("es-CL");
      },
    });
    displayed.current = value;

    if (prevValue !== value && cardRef.current) {
      gsap.fromTo(cardRef.current, { scale: 1.04 }, { scale: 1, duration: 0.5, ease: "back.out(2)" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Link href={def.href} className="block">
      <div
        ref={cardRef}
        className={`border-l-2 ${TONE_BORDER[tone]} bg-paper-bright p-4 lg:p-5 transition-colors duration-300 hover:bg-paper-bright/70`}
      >
        <div className="flex items-baseline justify-between mb-2">
          <span className="editorial-numeral text-xs text-ink-subtle">— {def.numeral}</span>
          {delta && (
            <span className="text-[10px] uppercase tracking-widest font-mono text-ink-muted">{delta}</span>
          )}
        </div>
        <p ref={numRef} className={`font-display text-3xl lg:text-4xl font-light tabular-nums nums-lining ${TONE_TEXT[tone]}`}>
          {value.toLocaleString("es-CL")}
        </p>
        <p className="eyebrow mt-1">{def.label}</p>
      </div>
    </Link>
  );
}

/**
 * Grilla unica de estadisticas del dashboard. Reemplaza las 3 barras de
 * alerta (QF/pedidos/abandonados) + la fila de alertas (stock/vencimiento/
 * recetas) + los 4 KPI cards, que se solapaban (stock bajo y recetas
 * pendientes se mostraban dos veces). Todas las tarjetas se muestran siempre
 * (incluso en 0) para que el refresco en vivo no mueva el layout — solo
 * cambia el numero, el tono y un pulso breve cuando el valor cambia.
 */
export default function LiveStatsGrid({ initialCounts }: { initialCounts: DashboardCounts }) {
  const [counts, setCounts] = useState<DashboardCounts>(initialCounts);
  const prevRef = useRef<DashboardCounts>(initialCounts);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/dashboard/counts");
        if (!res.ok) return;
        const fresh: DashboardCounts = await res.json();
        prevRef.current = counts;
        setCounts(fresh);
      } catch {
        // Silencioso: si falla un ciclo de polling, se reintenta en el siguiente.
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [counts]);

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-12">
      {CARDS.map((def) => (
        <StatCard key={def.numeral} def={def} counts={counts} prevValue={def.getValue(prevRef.current)} />
      ))}
    </section>
  );
}
