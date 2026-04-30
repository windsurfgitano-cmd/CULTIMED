"use client";

import { useState, useRef } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      window.prompt("Copia este enlace:", text);
    }
  }

  function selectAll() {
    inputRef.current?.select();
  }

  return (
    <div className="flex items-stretch gap-2">
      <input
        ref={inputRef}
        readOnly
        value={text}
        onClick={selectAll}
        onFocus={selectAll}
        className="input-editorial flex-1 font-mono text-sm bg-paper-dim/30"
      />
      <button
        type="button"
        onClick={copy}
        className={
          "px-5 font-mono text-[11px] uppercase tracking-widest border bg-paper-bright transition-colors " +
          (done
            ? "border-forest text-forest"
            : "border-rule hover:border-ink hover:text-ink text-ink-muted")
        }
      >
        {done ? "Copiado ✓" : "Copiar"}
      </button>
    </div>
  );
}
