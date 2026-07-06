import Link from "next/link";
import { redirect } from "next/navigation";
import { run } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/notify-utils";

export const dynamic = "force-dynamic";

// La baja se ejecuta SOLO en el POST del server action: los escáneres de email
// (Outlook SafeLinks, antivirus) hacen GET de los links — el GET debe ser inerte.
async function confirmBaja(formData: FormData) {
  "use server";
  const accountId = verifyUnsubscribeToken(String(formData.get("t") || ""));
  if (accountId) {
    await run(
      `UPDATE customer_accounts SET marketing_opt_out = true, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      accountId
    );
    redirect("/baja?ok=1");
  }
  redirect("/baja");
}

export default async function BajaPage({ searchParams }: { searchParams: { t?: string; ok?: string } }) {
  if (searchParams.ok === "1") {
    return (
      <Shell>
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
      </Shell>
    );
  }

  const accountId = verifyUnsubscribeToken(searchParams.t);
  if (!accountId) {
    return (
      <Shell>
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
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="eyebrow mb-6">— Recordatorios de recompra</p>
      <h1 className="font-display text-display-2 leading-[0.98] mb-6 text-balance">
        <span className="font-light">¿Dejar de recibir</span>{" "}
        <span className="italic font-normal">recordatorios</span>
        <span className="font-light">?</span>
      </h1>
      <p className="text-base text-ink-muted leading-relaxed max-w-md mx-auto mb-10">
        Solo dejarás de recibir los recordatorios de recompra. Los avisos sobre tus
        pedidos y recetas seguirán llegando normalmente.
      </p>
      <form action={confirmBaja} className="mb-6">
        <input type="hidden" name="t" value={searchParams.t} />
        <button type="submit" className="btn-brass">Confirmar baja</button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-24 lg:py-32 min-h-[60vh] text-center">
      {children}
      <div className="mt-4">
        <Link href="/" className="btn-link">Volver al inicio ←</Link>
      </div>
    </section>
  );
}
