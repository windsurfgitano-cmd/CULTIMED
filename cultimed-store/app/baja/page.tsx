import Link from "next/link";
import { run } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/notify-utils";

export const dynamic = "force-dynamic";

export default async function BajaPage({ searchParams }: { searchParams: { t?: string } }) {
  const accountId = verifyUnsubscribeToken(searchParams.t);
  let ok = false;
  if (accountId) {
    await run(
      `UPDATE customer_accounts SET marketing_opt_out = true, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      accountId
    );
    ok = true;
  }

  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-24 lg:py-32 min-h-[60vh] text-center">
      {ok ? (
        <>
          <p className="eyebrow mb-6">— Listo</p>
          <h1 className="font-display text-display-2 leading-[0.98] mb-6 text-balance">
            <span className="font-light">No te enviaremos más</span>{" "}
            <span className="italic font-normal">recordatorios</span>
            <span className="font-light">.</span>
          </h1>
          <p className="text-base text-ink-muted leading-relaxed max-w-md mx-auto mb-10">
            Quedaste fuera de los recordatorios de recompra. Los avisos sobre tus pedidos
            y recetas (transaccionales) seguirán llegando normalmente.
          </p>
        </>
      ) : (
        <>
          <p className="eyebrow text-sangria mb-6">— Enlace inválido</p>
          <h1 className="font-display text-display-2 leading-[0.98] mb-6 text-balance">
            <span className="font-light">Este enlace</span>{" "}
            <span className="italic font-normal">no es válido</span>
            <span className="font-light">.</span>
          </h1>
          <p className="text-base text-ink-muted leading-relaxed max-w-md mx-auto mb-10">
            El enlace de baja expiró o está incompleto. Escríbenos a
            contacto@dispensariocultimed.cl y te damos de baja a mano.
          </p>
        </>
      )}
      <Link href="/" className="btn-link">Volver al inicio ←</Link>
    </section>
  );
}
