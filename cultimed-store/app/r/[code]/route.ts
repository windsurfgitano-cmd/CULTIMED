// Landing de invitación: /r/[code]
// Setea la cookie de referral por 60 días y redirige a /registro (con banner del invitador).
import { NextResponse, type NextRequest } from "next/server";
import { findActiveCode, REFERRAL_COOKIE_NAME, REFERRAL_COOKIE_DAYS } from "@/lib/referrals";

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = (params.code || "").toUpperCase().trim();
  const ref = findActiveCode(code);

  // Si el código no existe o no está activo, igual redirigimos a home (no exponemos nada).
  const target = new URL(ref ? "/registro" : "/", req.url);
  if (ref) target.searchParams.set("invitado", "1");

  const res = NextResponse.redirect(target);
  if (ref) {
    res.cookies.set(REFERRAL_COOKIE_NAME, code, {
      httpOnly: false,                   // queremos leerla en cliente para mostrar banner
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: REFERRAL_COOKIE_DAYS * 86400,
    });
  }
  return res;
}
