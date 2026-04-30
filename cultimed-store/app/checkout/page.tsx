import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCustomer, canPurchase } from "@/lib/auth";
import { isMercadoPagoEnabled } from "@/lib/payments";
import CheckoutClient from "./CheckoutClient";

export default async function CheckoutPage() {
  const customer = await requireCustomer();
  const allowed = canPurchase(customer);
  const mpEnabled = isMercadoPagoEnabled();

  if (!allowed) {
    return (
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-20 lg:py-28">
        <div className="grid grid-cols-12 gap-x-6 gap-y-10">
          <div className="col-span-12 lg:col-span-7">
            <div className="flex items-baseline gap-6 mb-6">
              <span className="editorial-numeral text-2xl text-ink-subtle">— Detenido</span>
            </div>
            <h1 className="font-display text-display-2 leading-[0.98] text-balance">
              <span className="font-light">Antes de pagar,</span>{" "}
              <span className="italic font-normal">validamos</span>{" "}
              <span className="font-light">tu receta.</span>
            </h1>
            <p className="text-base text-ink-muted leading-relaxed mt-6 max-w-md">
              {customer.prescription_status === "none"
                ? "No has cargado tu receta médica. Súbela y nuestro QF la valida en 24h hábiles."
                : customer.prescription_status === "pending"
                ? "Tu receta está en revisión. Te avisaremos por WhatsApp cuando esté lista."
                : "Tu receta no está vigente. Carga una nueva o agenda una consulta."}
            </p>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:col-start-9">
            <Link href="/mi-cuenta/recetas" className="btn-brass w-full mb-3">Cargar receta</Link>
            <Link href="/consulta" className="btn-link w-full justify-center">Agendar consulta →</Link>
          </div>
        </div>
      </section>
    );
  }

  return <CheckoutClient customer={customer} mpEnabled={mpEnabled} />;
}
