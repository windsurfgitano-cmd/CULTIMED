"use client";

export default function PrintButton({ children = "Imprimir" }: { children?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary">
      <span className="material-symbols-outlined text-base">print</span>
      {children}
    </button>
  );
}
