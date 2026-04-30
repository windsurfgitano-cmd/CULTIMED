"use client";

import { useMemo, useState } from "react";
import type { PatientLite, BatchLite, RxLite } from "./page";

interface CartItem {
  batchId: number;
  productId: number;
  sku: string;
  name: string;
  presentation: string | null;
  batchNumber: string;
  quantity: number;
  price: number;
  available: number;
  isControlled: number;
  requiresRx: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  flores: "Flor",
  aceite_cbd: "Aceite",
  capsulas: "Cápsula",
  topico: "Tópico",
  farmaceutico: "Farma",
  otro: "Otro",
};

export default function NewDispensationClient({
  patients,
  batches,
  prescriptions,
  preselectPatient,
  preselectRx,
  onSubmit,
}: {
  patients: PatientLite[];
  batches: BatchLite[];
  prescriptions: (RxLite & { patient_id: number })[];
  preselectPatient: number | null;
  preselectRx: number | null;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(preselectPatient ? 2 : 1);
  const [patientId, setPatientId] = useState<number | null>(preselectPatient);
  const [patientQuery, setPatientQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [rxId, setRxId] = useState<number | null>(preselectRx);
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [notes, setNotes] = useState("");

  const patient = useMemo(() => patients.find((p) => p.id === patientId) || null, [patients, patientId]);
  const patientRxOptions = useMemo(
    () => prescriptions.filter((r) => r.patient_id === patientId),
    [prescriptions, patientId]
  );

  const filteredPatients = useMemo(() => {
    if (!patientQuery) return patients.slice(0, 30);
    const q = patientQuery.toLowerCase();
    return patients
      .filter((p) =>
        p.full_name.toLowerCase().includes(q) ||
        p.rut.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [patients, patientQuery]);

  const filteredBatches = useMemo(() => {
    let list = batches;
    if (productCategory) list = list.filter((b) => b.category === productCategory);
    if (productQuery) {
      const q = productQuery.toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.sku.toLowerCase().includes(q) ||
          b.batch_number.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 50);
  }, [batches, productQuery, productCategory]);

  const total = useMemo(() => cart.reduce((s, it) => s + it.price * it.quantity, 0), [cart]);
  const hasControlled = cart.some((it) => it.isControlled === 1);
  const hasRxRequired = cart.some((it) => it.requiresRx === 1);

  function addToCart(b: BatchLite) {
    setCart((cur) => {
      const exists = cur.find((it) => it.batchId === b.id);
      if (exists) {
        if (exists.quantity >= b.quantity_current) return cur;
        return cur.map((it) => (it.batchId === b.id ? { ...it, quantity: it.quantity + 1 } : it));
      }
      return [
        ...cur,
        {
          batchId: b.id,
          productId: b.product_id,
          sku: b.sku,
          name: b.name,
          presentation: b.presentation,
          batchNumber: b.batch_number,
          quantity: 1,
          price: b.price_per_unit,
          available: b.quantity_current,
          isControlled: b.is_controlled,
          requiresRx: b.requires_prescription,
        },
      ];
    });
  }
  function removeFromCart(batchId: number) {
    setCart((cur) => cur.filter((it) => it.batchId !== batchId));
  }
  function updateQty(batchId: number, qty: number) {
    setCart((cur) =>
      cur.map((it) =>
        it.batchId === batchId
          ? { ...it, quantity: Math.max(1, Math.min(qty, it.available)) }
          : it
      )
    );
  }

  function selectPatient(id: number) {
    setPatientId(id);
    setStep(2);
  }

  return (
    <div>
      {/* Stepper */}
      <ol className="mb-7 flex items-center gap-2 sm:gap-4 text-xs">
        {[
          { n: 1, l: "Paciente" },
          { n: 2, l: "Productos" },
          { n: 3, l: "Confirmar" },
        ].map((s, i) => {
          const active = s.n === step;
          const done = s.n < step;
          return (
            <li key={s.n} className="flex items-center gap-2">
              <button
                type="button"
                disabled={s.n > step + 0 && !patientId}
                onClick={() => {
                  if (s.n === 1) setStep(1);
                  if (s.n === 2 && patientId) setStep(2);
                  if (s.n === 3 && patientId && cart.length > 0) setStep(3);
                }}
                className={
                  "flex items-center gap-2 px-3 py-1.5 rounded-full font-semibold transition " +
                  (active
                    ? "bg-primary text-on-primary"
                    : done
                    ? "bg-tertiary-container/30 text-tertiary"
                    : "bg-surface-container-low text-on-surface-variant")
                }
              >
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px]">
                  {done ? "✓" : s.n}
                </span>
                <span className="hidden sm:inline">{s.l}</span>
              </button>
              {i < 2 && <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>}
            </li>
          );
        })}
      </ol>

      {/* STEP 1: Patient selection */}
      {step === 1 && (
        <div className="clinical-card p-6">
          <h2 className="text-base font-bold text-on-surface flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary">person_search</span>
            Seleccionar paciente
          </h2>
          <div className="relative mb-4">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input
              type="search"
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
              placeholder="Nombre o RUT…"
              autoFocus
              className="input-field pl-10"
            />
          </div>
          <ul className="divide-y divide-outline-variant/30 max-h-[480px] overflow-y-auto">
            {filteredPatients.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => selectPatient(p.id)}
                  className="w-full text-left p-3 hover:bg-surface-container-low transition flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{p.full_name}</p>
                    <p className="text-[11px] text-on-surface-variant font-mono">{p.rut}</p>
                  </div>
                  <span className={
                    p.membership_status === "active" ? "pill pill-success" :
                    p.membership_status === "pending" ? "pill pill-warning" :
                    "pill pill-error"
                  }>{p.membership_status === "active" ? "Activo" : p.membership_status === "pending" ? "Pendiente" : "Suspendido"}</span>
                </button>
              </li>
            ))}
            {filteredPatients.length === 0 && (
              <li className="text-center text-sm text-on-surface-variant p-6">
                Sin coincidencias.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* STEP 2: Product selection */}
      {step === 2 && patient && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="clinical-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Paciente</p>
                  <p className="text-base font-bold text-on-surface mt-0.5">{patient.full_name}</p>
                  <p className="text-xs text-on-surface-variant font-mono mt-0.5">{patient.rut}</p>
                  {patient.allergies && (
                    <p className="text-xs text-error mt-2 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">warning</span>
                      Alergias: {patient.allergies}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setStep(1)} className="text-xs text-primary hover:underline">
                  Cambiar paciente
                </button>
              </div>
            </div>

            <div className="clinical-card p-5">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary text-[20px]">medication</span>
                Catálogo (lotes con stock)
              </h3>
              <div className="flex flex-wrap gap-2 mb-3">
                <input
                  type="search"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="Buscar producto, SKU, lote…"
                  className="input-field flex-1 min-w-[200px]"
                />
                <select value={productCategory} onChange={(e) => setProductCategory(e.target.value)} className="input-field max-w-[180px]">
                  <option value="">Todas las categorías</option>
                  <option value="flores">Flores</option>
                  <option value="aceite_cbd">Aceites</option>
                  <option value="capsulas">Cápsulas</option>
                  <option value="topico">Tópicos</option>
                  <option value="farmaceutico">Farmacéutico</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <ul className="divide-y divide-outline-variant/30 max-h-[420px] overflow-y-auto">
                {filteredBatches.map((b) => (
                  <li key={b.id} className="py-2.5 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate flex items-center gap-1.5">
                        {b.name}
                        {b.is_controlled === 1 && <span className="text-error text-[11px]">⚠</span>}
                      </p>
                      <p className="text-[11px] text-on-surface-variant flex items-center gap-2 mt-0.5">
                        <span className="font-mono">{b.sku}</span>
                        <span>·</span>
                        <span>{CATEGORY_LABELS[b.category] || b.category}</span>
                        <span>·</span>
                        <span>Lote {b.batch_number}</span>
                      </p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5 flex gap-3">
                        {b.thc_percentage !== null && <span>THC {b.thc_percentage}%</span>}
                        {b.cbd_percentage !== null && <span>CBD {b.cbd_percentage}%</span>}
                        <span>Stock: {b.quantity_current}</span>
                      </p>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <p className="text-sm font-mono tabular-nums">${b.price_per_unit.toLocaleString("es-CL")}</p>
                      <button type="button" onClick={() => addToCart(b)} className="mt-1 text-xs font-semibold text-primary hover:underline">
                        + Agregar
                      </button>
                    </div>
                  </li>
                ))}
                {filteredBatches.length === 0 && (
                  <li className="text-center text-sm text-on-surface-variant p-6">
                    Sin productos coincidentes con stock disponible.
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Cart */}
          <aside className="space-y-4">
            <div className="clinical-card p-5 sticky top-20">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary text-[20px]">shopping_bag</span>
                Carrito ({cart.length})
              </h3>

              {cart.length === 0 ? (
                <p className="text-sm text-on-surface-variant text-center py-6">
                  Aún no has agregado productos.
                </p>
              ) : (
                <ul className="divide-y divide-outline-variant/30 mb-4">
                  {cart.map((it) => (
                    <li key={it.batchId} className="py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-on-surface truncate">{it.name}</p>
                          <p className="text-[11px] text-on-surface-variant font-mono">{it.batchNumber}</p>
                        </div>
                        <button type="button" onClick={() => removeFromCart(it.batchId)} className="text-error hover:bg-error-container/40 rounded p-0.5">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => updateQty(it.batchId, it.quantity - 1)} className="w-7 h-7 rounded bg-surface-container-low hover:bg-surface-container">−</button>
                          <input
                            type="number"
                            value={it.quantity}
                            onChange={(e) => updateQty(it.batchId, parseInt(e.target.value, 10) || 1)}
                            min={1}
                            max={it.available}
                            className="w-14 text-center font-mono input-field py-1"
                          />
                          <button type="button" onClick={() => updateQty(it.batchId, it.quantity + 1)} className="w-7 h-7 rounded bg-surface-container-low hover:bg-surface-container">+</button>
                        </div>
                        <span className="font-mono tabular-nums text-sm">
                          ${(it.price * it.quantity).toLocaleString("es-CL")}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {hasRxRequired && !rxId && (
                <div className="mb-3 p-3 bg-warning-container/40 border-l-4 border-warning rounded-r-lg">
                  <p className="text-[11px] font-bold text-warning uppercase tracking-wider">Requiere receta</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Asocia una receta médica del paciente antes de continuar.
                  </p>
                </div>
              )}

              {patientRxOptions.length > 0 && (
                <div className="mb-3">
                  <label className="input-label">Receta asociada</label>
                  <select value={rxId ?? ""} onChange={(e) => setRxId(e.target.value ? Number(e.target.value) : null)} className="input-field">
                    <option value="">Sin receta</option>
                    {patientRxOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.folio} · {r.diagnosis?.slice(0, 30) || "—"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="border-t border-outline-variant/40 pt-3 mt-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-semibold text-on-surface">Total</span>
                  <span className="text-2xl font-bold text-primary tabular-nums font-mono">
                    {total.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={cart.length === 0 || (hasRxRequired && !rxId)}
                onClick={() => setStep(3)}
                className="btn-primary w-full mt-4"
              >
                Continuar a confirmación
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* STEP 3: Confirm */}
      {step === 3 && patient && (
        <form action={onSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <input type="hidden" name="patient_id" value={patient.id} />
          {rxId && <input type="hidden" name="prescription_id" value={rxId} />}
          <input
            type="hidden"
            name="items_json"
            value={JSON.stringify(cart.map((it) => ({
              batchId: it.batchId,
              productId: it.productId,
              quantity: it.quantity,
              price: it.price,
            })))}
          />

          <div className="lg:col-span-2 space-y-4">
            <div className="clinical-card p-5">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-3 pb-3 border-b border-outline-variant/40">
                <span className="material-symbols-outlined text-primary text-[20px]">person</span>
                Paciente
              </h3>
              <p className="text-base font-semibold text-on-surface">{patient.full_name}</p>
              <p className="text-xs text-on-surface-variant font-mono">{patient.rut}</p>
            </div>

            <div className="clinical-card p-5">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-3 pb-3 border-b border-outline-variant/40">
                <span className="material-symbols-outlined text-primary text-[20px]">list_alt</span>
                Detalle de la dispensación
              </h3>
              <ul className="divide-y divide-outline-variant/30">
                {cart.map((it) => (
                  <li key={it.batchId} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-on-surface">
                        {it.name}
                        {it.isControlled === 1 && <span className="ml-2 text-[10px] text-error font-bold uppercase">Controlado</span>}
                      </p>
                      <p className="text-[11px] text-on-surface-variant font-mono">
                        {it.sku} · Lote {it.batchNumber} · ${it.price.toLocaleString("es-CL")} c/u
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono tabular-nums">×{it.quantity}</p>
                      <p className="text-xs text-on-surface-variant tabular-nums font-mono">
                        ${(it.price * it.quantity).toLocaleString("es-CL")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-outline-variant/40 pt-3 mt-3 flex justify-between items-baseline">
                <span className="text-sm font-bold text-on-surface">Total a pagar</span>
                <span className="text-2xl font-bold text-primary tabular-nums font-mono">
                  {total.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            <div className="clinical-card p-5">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-3 pb-3 border-b border-outline-variant/40">
                <span className="material-symbols-outlined text-primary text-[20px]">payments</span>
                Pago y notas
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Método de pago</label>
                  <select name="payment_method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input-field">
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </div>
                <div className="md:col-span-1" />
                <div className="md:col-span-2">
                  <label className="input-label">Notas (opcional)</label>
                  <textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input-field" placeholder="Observaciones internas, acuerdos con paciente..." />
                </div>
              </div>
            </div>

            {hasControlled && (
              <div className="p-4 bg-error-container/40 border-l-4 border-error rounded-r-lg">
                <p className="text-sm font-bold text-on-error-container flex items-center gap-2">
                  <span className="material-symbols-outlined ms-fill">gpp_maybe</span>
                  Productos controlados detectados
                </p>
                <p className="text-xs text-on-surface-variant mt-1">
                  Verifica que la receta retenida esté firmada y archivada físicamente antes de confirmar.
                </p>
              </div>
            )}
          </div>

          <aside>
            <div className="clinical-card p-5 sticky top-20">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">
                Resumen
              </h3>
              <dl className="text-sm space-y-2">
                <div className="flex justify-between">
                  <dt className="text-on-surface-variant">Items</dt>
                  <dd className="text-on-surface tabular-nums">{cart.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-on-surface-variant">Unidades</dt>
                  <dd className="text-on-surface tabular-nums">{cart.reduce((s, it) => s + it.quantity, 0)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-on-surface-variant">Receta</dt>
                  <dd className="text-on-surface text-xs">
                    {rxId ? patientRxOptions.find((r) => r.id === rxId)?.folio : "—"}
                  </dd>
                </div>
                <div className="border-t border-outline-variant/40 pt-2 mt-2 flex justify-between items-baseline">
                  <dt className="text-on-surface font-bold">Total</dt>
                  <dd className="text-xl font-bold text-primary tabular-nums font-mono">
                    {total.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-col gap-2 mt-5">
                <button type="submit" className="btn-primary w-full">
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  Confirmar dispensación
                </button>
                <button type="button" onClick={() => setStep(2)} className="btn-secondary w-full">
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  Volver al carrito
                </button>
              </div>
            </div>
          </aside>
        </form>
      )}
    </div>
  );
}
