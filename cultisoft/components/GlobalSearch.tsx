"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  type: "patient" | "prescription" | "dispensation" | "order" | "product" | "ambassador";
  id: number;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
}

const TYPE_LABEL: Record<string, string> = {
  patient: "Paciente",
  prescription: "Receta",
  dispensation: "Dispensación",
  order: "Pedido",
  product: "Producto",
  ambassador: "Embajador",
};

const TYPE_ICON: Record<string, string> = {
  patient: "person",
  prescription: "description",
  dispensation: "medication",
  order: "shopping_bag",
  product: "inventory_2",
  ambassador: "groups",
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Cmd+K / Ctrl+K abre el dialog
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Debounce + fetch
  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        const d = await res.json();
        setResults(d.results || []);
        setActiveIdx(0);
      } catch (_e) { /* ignore */ }
      finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  function go(href: string) {
    setOpen(false);
    setQ("");
    setResults([]);
    router.push(href);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIdx]) {
      e.preventDefault();
      go(results[activeIdx].href);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Buscar (Cmd+K)"
        className="hidden lg:flex items-center gap-2 px-3 py-1.5 border border-rule hover:border-ink-muted text-ink-muted hover:text-ink transition-colors"
      >
        <span className="material-symbols-outlined text-base">search</span>
        <span className="text-xs font-mono uppercase tracking-widest">Buscar</span>
        <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 border border-rule-soft bg-paper-dim/50 nums-lining">⌘K</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl bg-paper-bright border border-rule shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-rule">
          <span className="material-symbols-outlined text-ink-subtle">search</span>
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Buscar paciente, receta, pedido, producto, embajador…"
            className="flex-1 bg-transparent outline-none text-base placeholder-ink-subtle"
          />
          <button onClick={() => setOpen(false)} className="text-[10px] font-mono px-1.5 py-0.5 border border-rule-soft text-ink-subtle">ESC</button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim().length < 2 ? (
            <div className="p-8 text-center text-sm text-ink-subtle">
              Escribe al menos 2 caracteres para buscar.
            </div>
          ) : loading && results.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-subtle">Buscando…</div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-muted">
              Sin resultados para "<strong>{q}</strong>".
            </div>
          ) : (
            <ul>
              {results.map((r, i) => (
                <li key={`${r.type}-${r.id}`}>
                  <button
                    type="button"
                    onClick={() => go(r.href)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={
                      "w-full text-left px-5 py-3 flex items-center gap-4 border-b border-rule-soft transition-colors " +
                      (i === activeIdx ? "bg-paper-dim/70" : "hover:bg-paper-dim/40")
                    }
                  >
                    <span className="material-symbols-outlined text-ink-muted text-[20px] shrink-0">
                      {TYPE_ICON[r.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-ink truncate">{r.title}</p>
                      <p className="text-[12px] text-ink-muted truncate font-mono">{r.subtitle}</p>
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-ink-subtle shrink-0">
                      {TYPE_LABEL[r.type]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-2 border-t border-rule bg-paper-dim/30 flex items-center justify-between text-[11px] font-mono text-ink-subtle">
          <span>↑↓ navegar · ↵ abrir · ESC cerrar</span>
          <span>{results.length} resultado{results.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}
