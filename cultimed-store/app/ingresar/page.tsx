import Link from "next/link";
import { redirect } from "next/navigation";
import { loginCustomer, getCurrentCustomer } from "@/lib/auth";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/mi-cuenta");
  if (!email || !password) redirect("/ingresar?e=missing&next=" + encodeURIComponent(next));
  const acc = await loginCustomer(email, password);
  if (!acc) redirect("/ingresar?e=invalid&next=" + encodeURIComponent(next));
  redirect(next);
}

const ERR: Record<string, string> = {
  missing: "Email y contraseña son requeridos.",
  invalid: "Credenciales incorrectas.",
};

export default async function LoginPage({ searchParams }: { searchParams: { e?: string; next?: string; reset?: string } }) {
  if (await getCurrentCustomer()) redirect(searchParams.next || "/mi-cuenta");
  const error = searchParams.e ? ERR[searchParams.e] : null;
  const next = searchParams.next || "/mi-cuenta";
  const resetOk = searchParams.reset === "ok";

  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-20 lg:py-32 min-h-[80vh]">
      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        <div className="col-span-12 lg:col-span-5">
          <div className="flex items-baseline gap-6 mb-6">
            <span className="editorial-numeral text-2xl text-ink-subtle">— Ingresar</span>
          </div>
          <h1 className="font-display text-display-2 leading-[0.98] mb-6 text-balance">
            <span className="font-light">Bienvenido</span>{" "}
            <span className="italic font-normal">de vuelta.</span>
          </h1>
          <p className="text-base text-ink-muted leading-relaxed max-w-md">
            Accede a tu cuenta para revisar tus recetas, hacer seguimiento de pedidos
            y dispensar productos validados.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-5 lg:col-start-8">
          {resetOk && (
            <div className="mb-8 p-5 border-l-2 border-forest bg-forest/5">
              <p className="eyebrow text-forest mb-1">— Contraseña actualizada</p>
              <p className="text-sm text-ink">Tu nueva contraseña ya está activa. Ingresa con ella.</p>
            </div>
          )}
          {error && (
            <div className="mb-8 p-5 bg-sangria/10 border-l-2 border-sangria">
              <p className="eyebrow text-sangria mb-1">— Error</p>
              <p className="text-sm text-ink">{error}</p>
            </div>
          )}

          <form action={loginAction} className="space-y-7">
            <input type="hidden" name="next" value={next} />
            <div>
              <label htmlFor="email" className="input-label">Email</label>
              <input id="email" name="email" type="email" required autoFocus autoComplete="email" className="input-editorial" />
            </div>
            <div>
              <label htmlFor="password" className="input-label">Contraseña</label>
              <input id="password" name="password" type="password" required autoComplete="current-password" className="input-editorial" />
            </div>
            <button type="submit" className="btn-brass w-full">Ingresar →</button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/recuperar" className="text-sm text-ink-muted hover:text-ink underline-offset-4 hover:underline decoration-ink-muted/40">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <div className="mt-10 pt-8 border-t border-rule">
            <p className="text-sm text-ink-muted">
              ¿Aún no tienes cuenta?{" "}
              <Link href={`/registro?next=${encodeURIComponent(next)}`} className="text-ink underline underline-offset-4 decoration-ink/40 hover:decoration-ink">
                Crear una cuenta
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
