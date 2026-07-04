import Link from "next/link";
import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import PrintButton from "@/components/PrintButton";

export default async function ManualPage() {
  await requireRole("admin", "superadmin");

  return (
    <article className="max-w-[920px] mx-auto">
      <PageHeader
        numeral="MN"
        eyebrow="Manual de operación · v1.0"
        title="Manual del dispensario"
        subtitle="El flujo completo del trabajo diario en Cultimed: desde un paciente nuevo hasta un pedido entregado con WhatsApp y trazabilidad. Este documento es imprimible — botón superior."
        actions={<PrintButton>Imprimir manual</PrintButton>}
      />

      {/* TOC */}
      <nav className="mb-16 lg:mb-20 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-2 border-y border-rule py-8">
        <p className="sm:col-span-2 eyebrow mb-3">— Índice</p>
        {TOC.map((t) => (
          <a key={t.n} href={`#${t.id}`} className="flex items-baseline gap-4 py-1.5 group">
            <span className="editorial-numeral text-base text-ink-subtle group-hover:text-brass">— {t.n}</span>
            <span className="font-display text-lg group-hover:italic transition-all">{t.title}</span>
          </a>
        ))}
      </nav>

      {/* Sections */}
      <Section
        id="universo" n="01"
        eyebrow="Universo"
        title="Dos sistemas, una sola información."
      >
        <p>
          Cultimed opera en <em>dos planos</em>: el <strong>panel interno (CultiSoft)</strong> que estás
          usando ahora, y la <strong>tienda pública</strong> donde los pacientes se registran y compran.
        </p>
        <p>
          Cuando un paciente sube una receta o completa un pedido en la web, aparece de inmediato en
          este panel. Cuando tú apruebas o confirmas algo aquí, el paciente lo ve en su cuenta.
        </p>
        <KV
          rows={[
            ["Panel interno", "Este sistema — lo usa el equipo con su cuenta de personal."],
            ["Tienda pública", "dispensariocultimed.cl — donde los pacientes se registran y compran."],
          ]}
        />
      </Section>

      <Section
        id="roles" n="02"
        eyebrow="Roles"
        title="Quién puede hacer qué."
      >
        <p>Cinco roles definen los permisos de cada cuenta de personal:</p>
        <Table
          head={["Rol", "Responsabilidad"]}
          rows={[
            ["Super Admin",            "Acceso total + gestión de staff + bitácora del sistema. Solo el dueño/director."],
            ["Administrador",          "Operación día a día: pacientes, recetas, pedidos, embajadores, inventario."],
            ["Químico Farmacéutico",   "Validación de recetas y dispensación de productos controlados."],
            ["Dispensador",            "Preparación y registro de pedidos."],
            ["Doctor (staff)",         "Médico interno habilitado para emitir recetas digitales."],
          ]}
        />
        <p className="text-[13px] text-ink-muted mt-4 leading-relaxed">
          Cada acción importante queda registrada en la bitácora del sistema con fecha, IP y usuario,
          conforme a Ley 19.628 art. 11.
        </p>
      </Section>

      <Section
        id="paciente-nuevo" n="03"
        eyebrow="Flujo · Paciente nuevo"
        title="De la web a aprobado en 4 pasos."
      >
        <Steps
          items={[
            { n: "I",   t: "Registro web",          d: "El paciente entra a la tienda, acepta el age gate (Ley 20.850) y crea su cuenta con nombre, RUT, teléfono y email." },
            { n: "II",  t: "Carga de receta",        d: "Sube su receta médica vigente desde Mi cuenta → Recetas. Acepta PDF, JPG o PNG hasta 8 MB. El estado pasa a 'pendiente'." },
            { n: "III", t: "Validación QF",         d: "Aquí en CultiSoft, el QF entra a Recetas web → estado 'pendiente', revisa el documento y aprueba (o rechaza con motivo)." },
            { n: "IV",  t: "Acceso al catálogo",    d: "Apenas se aprueba, el paciente ve precios y stock en la web y puede agregar productos al carrito." },
          ]}
        />
        <Tip>
          <strong>El plazo</strong> es 24h hábiles para validar una receta. Si demora más, el paciente
          probablemente nos contactará por WhatsApp — recuérdale que lo estamos revisando.
        </Tip>
      </Section>

      <Section
        id="pedido" n="04"
        eyebrow="Flujo · Pedido y pago"
        title="De carrito a comprobante en 5 hitos."
      >
        <Steps
          items={[
            { n: "I",   t: "Carrito",                d: "El paciente agrega productos. Solo ve precio si su receta está aprobada y si el producto coincide con lo prescrito." },
            { n: "II",  t: "Checkout",               d: "Selecciona retiro o despacho a domicilio. Confirma teléfono. Genera el pedido con folio único." },
            { n: "III", t: "Datos de transferencia", d: "El pedido queda pendiente de pago. Se le muestran los datos bancarios y su RUT como referencia obligatoria." },
            { n: "IV",  t: "Subida de comprobante",  d: "Hace la transferencia y sube imagen del comprobante." },
            { n: "V",   t: "Validación admin",       d: "Aquí, en Pedidos web, revisas el comprobante. Si está OK marcas 'pago confirmado' y se dispara el envío de WhatsApp." },
          ]}
        />
        <Tip>
          <strong>Plazo de envío:</strong> 24 a 72 horas hábiles desde que confirmamos el pago.
          Es lo que sale en checkout y también en el WhatsApp automático.
        </Tip>
      </Section>

      <Section
        id="inventario" n="05"
        eyebrow="Inventario"
        title="Lotes, vencimientos, alertas."
      >
        <p>
          Cada producto tiene uno o varios <em>lotes</em> con un número único, fecha de vencimiento,
          stock actual y precio por unidad. Cuando se confirma un pedido, descontamos del lote más
          próximo a vencer automáticamente.
        </p>
        <KV
          rows={[
            ["Stock bajo",    "≤ 5 unidades disponibles → alerta en Dashboard"],
            ["Por vencer",    "≤ 60 días para vencimiento → alerta en Dashboard"],
            ["Agotado",       "Stock = 0 → no aparece en la tienda, el paciente no puede pedirlo"],
            ["Ingreso lote",  "Inventario → Ingresar lote → registra cantidad, costo, vencimiento"],
            ["Ajuste manual", "Inventario → [lote] → Ajustar stock (motivo obligatorio)"],
          ]}
        />
      </Section>

      <Section
        id="trazabilidad" n="06"
        eyebrow="Trazabilidad y compliance"
        title="Todo queda escrito."
      >
        <p>
          Por exigencia de la <em>Ley 20.850</em>, <em>D.S. 345/2016</em> y <em>Ley 19.628 art. 11</em>,
          mantenemos registro inalterable de:
        </p>
        <ul className="space-y-3 my-6">
          {[
            "Cada login del personal (cuándo y desde qué IP).",
            "Cada cambio de estado de receta o pedido.",
            "Cada movimiento de inventario, con motivo y operador.",
            "Cada documento clínico subido (receta, comprobante de pago, COA).",
            "Cada pedido web — desde creación hasta entrega.",
          ].map((t, i) => (
            <li key={i} className="flex items-baseline gap-4">
              <span className="editorial-numeral text-base text-ink-subtle w-8 shrink-0">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-ink-muted leading-relaxed">{t}</span>
            </li>
          ))}
        </ul>
        <Tip>
          El registro de auditoría no se puede editar ni borrar. Si SANNA o el ISP requieren un reporte,
          exportamos un CSV filtrado por fecha y tipo de acción.
        </Tip>
      </Section>

      {/* Footer of manual */}
      <footer className="mt-20 pt-10 border-t border-rule text-center">
        <p className="font-display text-2xl italic text-ink-muted">— Fin del manual —</p>
        <p className="mt-3 text-[11px] font-mono uppercase tracking-widest text-ink-subtle">
          Cultimed v1.0 · Documento interno · Confidencial
        </p>
        <p className="mt-1 text-[11px] font-mono uppercase tracking-widest text-ink-subtle">
          contacto@dispensariocultimed.cl · +56 9 9317 7375
        </p>
      </footer>
    </article>
  );
}

const TOC = [
  { n: "01", id: "universo",       title: "Universo: dos sistemas" },
  { n: "02", id: "roles",          title: "Roles del personal" },
  { n: "03", id: "paciente-nuevo", title: "Flujo: paciente nuevo" },
  { n: "04", id: "pedido",         title: "Flujo: pedido y pago" },
  { n: "05", id: "inventario",     title: "Inventario y alertas" },
  { n: "06", id: "trazabilidad",   title: "Trazabilidad y compliance" },
];

function Section({
  id, n, eyebrow, title, children,
}: {
  id: string; n: string; eyebrow: string; title: string; children: React.ReactNode;
}) {
  const words = title.split(" ");
  return (
    <section id={id} className="mb-16 lg:mb-24 scroll-mt-24">
      <div className="grid grid-cols-12 gap-6">
        <header className="col-span-12 lg:col-span-3 lg:sticky lg:top-24 self-start">
          <p className="eyebrow flex items-baseline gap-3 mb-2">
            <span className="editorial-numeral text-base text-ink-subtle">— {n}</span>
            <span>{eyebrow}</span>
          </p>
          <h2 className="font-display text-2xl lg:text-3xl leading-[1.1] text-balance">
            <span className="font-light">{words[0]}</span>{" "}
            <span className="italic font-normal">{words.slice(1).join(" ")}</span>
          </h2>
        </header>
        <div className="col-span-12 lg:col-span-8 lg:col-start-5 prose-editorial space-y-5 text-[15px] lg:text-base leading-[1.75] text-ink-muted text-pretty">
          {children}
        </div>
      </div>
    </section>
  );
}

function Steps({ items }: { items: Array<{ n: string; t: string; d: string }> }) {
  return (
    <ol className="my-8 space-y-0">
      {items.map((s) => (
        <li key={s.n} className="grid grid-cols-12 gap-3 items-baseline pb-5 mb-5 border-b border-rule-soft last:border-b-0 last:mb-0 last:pb-0">
          <span className="col-span-1 editorial-numeral text-base text-ink-subtle">{s.n}</span>
          <div className="col-span-11">
            <p className="font-display text-xl text-ink mb-1">{s.t}</p>
            <p className="text-sm leading-relaxed">{s.d}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function KV({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="my-6 space-y-3 border-y border-rule-soft py-5">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-12 gap-3 items-baseline">
          <dt className="col-span-12 sm:col-span-4 eyebrow">{k}</dt>
          <dd className="col-span-12 sm:col-span-8 text-sm nums-lining text-ink leading-relaxed">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="my-8 overflow-x-auto border-y border-rule">
      <table className="w-full text-left">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="text-[10px] uppercase tracking-widest font-mono text-ink-muted py-3 pr-5 last:pr-0 border-b border-ink">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-rule-soft first:border-t-0">
              {r.map((c, j) => (
                <td key={j} className={
                  "py-3 pr-5 last:pr-0 text-sm align-baseline " +
                  (j === 0 ? "font-display text-base text-ink whitespace-nowrap" : "text-ink-muted leading-relaxed")
                }>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <aside className="my-6 p-5 bg-paper-dim/40 border-l-2 border-brass">
      <p className="eyebrow text-brass-dim mb-2">— Nota</p>
      <p className="text-[15px] leading-relaxed text-ink">{children}</p>
    </aside>
  );
}
