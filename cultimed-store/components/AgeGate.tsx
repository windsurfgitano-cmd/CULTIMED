"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "cultimed_age_gate_v1";

export default function AgeGate() {
  const [open, setOpen] = useState(false);
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [c3, setC3] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem(STORAGE_KEY);
    if (!accepted) {
      // Tiny delay so it doesn't flash on hydration
      const t = setTimeout(() => setOpen(true), 350);
      return () => clearTimeout(t);
    }
  }, []);

  if (!open) return null;

  const all = c1 && c2 && c3;

  function accept() {
    if (!all) return;
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8 animate-fade-in" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" aria-hidden />
      <div className="relative w-full max-w-2xl bg-paper border border-rule shadow-editorial">
        {/* Header band */}
        <div className="px-8 lg:px-14 pt-10 lg:pt-14 pb-6">
          <div className="flex items-baseline justify-between gap-4 mb-8">
            <span className="eyebrow">— Verificación de acceso</span>
            <span className="font-mono text-[10px] tracking-widest uppercase text-ink-subtle">Ley 20.850</span>
          </div>
          <h2 className="font-display text-display-3 leading-[1.05] mb-5 text-balance">
            <span className="font-light">Este es</span>{" "}
            <span className="italic font-normal">un sitio</span>{" "}
            <span className="font-light">para pacientes con prescripción.</span>
          </h2>
          <p className="text-base text-ink-muted leading-relaxed text-pretty max-w-lg">
            Antes de continuar necesitamos verificar tu identidad y autorización. Toda
            comercialización de cannabis medicinal en Chile requiere receta médica vigente
            y supervisión profesional.
          </p>
        </div>

        <div className="hairline mx-8 lg:mx-14" />

        {/* Checks */}
        <div className="px-8 lg:px-14 py-7 space-y-4">
          <Check
            checked={c1}
            onChange={setC1}
            label="Confirmo que soy mayor de 18 años."
          />
          <Check
            checked={c2}
            onChange={setC2}
            label="Cuento con receta médica vigente o soy representante legal de un paciente con receta vigente, conforme a la Ley 20.850."
          />
          <Check
            checked={c3}
            onChange={setC3}
            label={
              <>
                Acepto los{" "}
                <a href="/terminos" className="underline underline-offset-4 decoration-ink/40 hover:decoration-ink">Términos de Uso</a>{" "}
                y{" "}
                <a href="/privacidad" className="underline underline-offset-4 decoration-ink/40 hover:decoration-ink">Política de Privacidad</a>
                .
              </>
            }
          />
        </div>

        <div className="hairline mx-8 lg:mx-14" />

        {/* Actions */}
        <div className="px-8 lg:px-14 pt-6 pb-10 lg:pb-12 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <a
            href="https://www.bcn.cl/leychile/navegar?idNorma=1078171"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono tracking-widest uppercase text-ink-muted hover:text-ink transition-colors"
          >
            Conocer la Ley 20.850 →
          </a>
          <button
            type="button"
            onClick={accept}
            disabled={!all}
            className={
              "px-8 py-3.5 text-sm tracking-editorial font-medium transition-all duration-300 " +
              (all ? "bg-ink text-paper hover:bg-forest" : "bg-rule-soft text-ink-subtle cursor-not-allowed")
            }
          >
            Confirmo y continúo →
          </button>
        </div>

        {/* Microlegal */}
        <div className="bg-paper-dim px-8 lg:px-14 py-5">
          <p className="text-[11px] font-mono leading-relaxed text-ink-muted">
            El acceso a este sitio está regulado por la Ley 20.850 y el D.S. Nº 345/2016.
            La comercialización no autorizada de cannabis está penada por la Ley 20.000.
            Cultimed opera exclusivamente dentro del marco legal vigente.
          </p>
        </div>
      </div>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-4 cursor-pointer group">
      <span
        className={
          "shrink-0 mt-0.5 w-5 h-5 border transition-all duration-200 flex items-center justify-center " +
          (checked
            ? "bg-ink border-ink"
            : "bg-paper-bright border-ink/30 group-hover:border-ink")
        }
      >
        {checked && (
          <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
            <path d="M1 4.5L4.5 8L11 1" stroke="#F4EFE6" strokeWidth="1.5" />
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span className="text-sm leading-relaxed text-ink-muted group-hover:text-ink transition-colors">
        {label}
      </span>
    </label>
  );
}
