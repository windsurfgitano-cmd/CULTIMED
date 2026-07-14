"use client";

import { useState, useRef, useEffect } from "react";
import { filterComunas } from "@/lib/comunas-rm";

interface ComunaComboboxProps {
  value: string;
  onChange: (comuna: string) => void;
  placeholder?: string;
}

export default function ComunaCombobox({ value, onChange, placeholder = "Busca tu comuna" }: ComunaComboboxProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Refleja el valor externo (p. ej. reset del form) en el texto visible.
  useEffect(() => { setQuery(value); }, [value]);

  // Cerrar al clickear fuera; al cerrar, el texto vuelve a la selección válida.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [value]);

  const matches = filterComunas(query);

  function select(name: string) {
    onChange(name);
    setQuery(name);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { setOpen(true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && open && matches[highlight]) { e.preventDefault(); select(matches[highlight].name); }
    else if (e.key === "Escape") { setOpen(false); setQuery(value); }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        autoComplete="off"
        className="input-editorial w-full"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          if (value) onChange(""); // invalida la selección mientras se re-tipea
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-auto bg-paper-bright border border-rule shadow-editorial">
          {matches.map((c, i) => (
            <li
              key={c.name}
              onMouseDown={(e) => { e.preventDefault(); select(c.name); }}
              onMouseEnter={() => setHighlight(i)}
              className={
                "px-4 py-2.5 text-sm cursor-pointer flex justify-between items-baseline gap-3 " +
                (i === highlight ? "bg-paper-dim text-ink" : "text-ink-muted")
              }
            >
              <span>{c.name}</span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-ink-subtle nums-lining shrink-0">
                {c.outlying ? "$9.990" : "$4.990"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && matches.length === 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-paper-bright border border-rule px-4 py-3 text-sm text-ink-muted">
          Solo despachamos dentro de la Región Metropolitana.
        </div>
      )}
    </div>
  );
}
