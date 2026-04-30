import { redirect } from "next/navigation";
import { login, getCurrentStaff } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  if (!email || !password) redirect("/login?e=missing");
  const user = await login(email, password);
  if (!user) redirect("/login?e=invalid");
  await logAudit({ staffId: user.id, action: "login", entityType: "staff", entityId: user.id });
  redirect("/dashboard");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { e?: string };
}) {
  if (await getCurrentStaff()) redirect("/dashboard");

  const errorMsg =
    searchParams.e === "invalid"
      ? "Credenciales inválidas. Verifica e intenta de nuevo."
      : searchParams.e === "missing"
      ? "Email y contraseña son requeridos."
      : null;

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-paper">
      {/* LEFT — Editorial brand panel */}
      <aside className="lg:col-span-5 xl:col-span-6 bg-forest text-paper relative overflow-hidden hidden lg:flex flex-col justify-between p-10 xl:p-14">
        {/* Subtle grain */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            mixBlendMode: "multiply",
          }}
          aria-hidden
        />
        <div className="relative">
          <div className="font-display text-4xl text-paper">
            <span className="font-light">Culti</span>
            <span className="italic font-medium text-brass-bright">soft</span>
          </div>
          <p className="eyebrow text-paper/60 mt-2">— Sistema interno · v1.0</p>
        </div>

        <div className="relative max-w-lg">
          <p className="eyebrow text-paper/60 mb-4">— Operación clínica</p>
          <h2 className="font-display text-display-2 leading-[1.0] mb-8 text-balance">
            <span className="font-light">Una</span>{" "}
            <span className="italic font-normal">farmacia</span>{" "}
            <span className="font-light">no se improvisa.</span>
          </h2>
          <div className="hairline bg-paper/30 mb-6" />
          <p className="text-sm text-paper/80 leading-relaxed">
            Acceso restringido al personal autorizado. Toda actividad queda registrada
            en bitácora de auditoría conforme a la normativa SANNA y D.S. Nº 345/2016.
          </p>
        </div>

        <div className="relative grid grid-cols-3 gap-x-4 gap-y-2 text-[10px] uppercase tracking-widest text-paper/50 font-mono">
          <span>· SANNA</span>
          <span>· ISP</span>
          <span>· GMP</span>
          <span>· Ley 20.850</span>
          <span>· DS 345/2016</span>
          <span>· Ley 19.628</span>
        </div>
      </aside>

      {/* RIGHT — Form column */}
      <main className="lg:col-span-7 xl:col-span-6 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile-only brand */}
          <div className="lg:hidden mb-10 text-center">
            <p className="font-display text-3xl">
              <span className="font-light">Culti</span>
              <span className="italic font-medium text-brass-dim">soft</span>
            </p>
            <p className="eyebrow text-ink-subtle mt-2">— Sistema interno</p>
          </div>

          <div className="flex items-baseline gap-4 mb-6">
            <span className="editorial-numeral text-base text-ink-subtle">— I</span>
            <span className="eyebrow">Iniciar sesión</span>
          </div>

          <h1 className="font-display text-display-3 leading-[1.0] mb-4 text-balance">
            <span className="font-light">Buen día,</span><br />
            <span className="italic font-normal">¿quién está</span>{" "}
            <span className="font-light">de turno?</span>
          </h1>
          <p className="text-sm text-ink-muted mb-10 max-w-sm leading-relaxed">
            Ingresa con tu cuenta de personal. Si necesitas acceso, contacta al administrador
            del dispensario.
          </p>

          {errorMsg && (
            <div className="mb-7 p-4 bg-sangria/10 border-l-2 border-sangria">
              <p className="eyebrow text-sangria mb-1">— Error</p>
              <p className="text-sm text-ink">{errorMsg}</p>
            </div>
          )}

          <form action={loginAction} className="space-y-7">
            <div>
              <label htmlFor="email" className="input-label">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                className="input-field"
                placeholder="tu@dispensariocultimed.cl"
              />
            </div>
            <div>
              <label htmlFor="password" className="input-label">Contraseña</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="input-field"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="btn-primary w-full">
              Acceder
              <span aria-hidden>→</span>
            </button>
          </form>

          <div className="mt-12 pt-7 border-t border-rule-soft">
            <p className="eyebrow text-ink-subtle mb-3">— Credenciales de prueba (MVP local)</p>
            <ul className="text-[12px] font-mono nums-lining text-ink-muted space-y-1.5">
              <li>admin@cultimed.cl · admin123</li>
              <li>farmacia@cultimed.cl · farma123</li>
              <li>qf.morales@cultimed.cl · quimico123</li>
            </ul>
          </div>

          <p className="mt-10 text-[11px] font-mono text-ink-subtle text-center">
            © {new Date().getFullYear()} Cultimed SpA · Cumplimiento normativa SANNA
          </p>
        </div>
      </main>
    </div>
  );
}
