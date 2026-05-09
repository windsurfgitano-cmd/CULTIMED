// Genera PNG QR dinámico para el código de embajador.
// Sin auth — el QR es público (no expone más que el link que ya es público).
// Path: /api/r/<CODE>/qr
import { type NextRequest } from "next/server";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

const STORE_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://dispensariocultimed.cl";

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = (params.code || "").toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    return new Response("invalid code", { status: 400 });
  }
  const url = `${STORE_BASE}/r/${code}`;
  const png = await QRCode.toBuffer(url, {
    errorCorrectionLevel: "Q",
    type: "png",
    margin: 2,
    width: 600,
    color: { dark: "#0F1A22", light: "#F7F1E5" },
  });
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="cultimed-${code}.png"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
