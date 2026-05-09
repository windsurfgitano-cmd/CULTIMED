// Búsqueda global para Cmd+K. Search across pacientes, recetas, dispensaciones,
// pedidos web, productos. Solo staff autenticado.
import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { all } from "@/lib/db";

export const dynamic = "force-dynamic";

interface SearchResult {
  type: "patient" | "prescription" | "dispensation" | "order" | "product" | "ambassador";
  id: number;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
}

export async function GET(req: NextRequest) {
  await requireStaff();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ results: [], q });

  const like = `%${q}%`;
  const results: SearchResult[] = [];

  // 1. Pacientes
  const patients = await all<{ id: number; rut: string; full_name: string; email: string | null; phone: string | null }>(
    `SELECT id, rut, full_name, email, phone FROM patients
     WHERE full_name ILIKE ? OR rut ILIKE ? OR email ILIKE ? OR phone ILIKE ?
     ORDER BY full_name LIMIT 6`,
    like, like, like, like
  );
  for (const p of patients) {
    results.push({
      type: "patient",
      id: p.id,
      title: p.full_name,
      subtitle: `${p.rut}${p.email ? " · " + p.email : ""}${p.phone ? " · " + p.phone : ""}`,
      href: `/patients/${p.id}`,
    });
  }

  // 2. Recetas internas
  const prescriptions = await all<{ id: number; folio: string; patient_name: string; status: string }>(
    `SELECT r.id, r.folio, p.full_name as patient_name, r.status
     FROM prescriptions r
     JOIN patients p ON p.id = r.patient_id
     WHERE r.folio ILIKE ? OR p.full_name ILIKE ?
     ORDER BY r.created_at DESC LIMIT 4`,
    like, like
  );
  for (const r of prescriptions) {
    results.push({
      type: "prescription",
      id: r.id,
      title: `Receta ${r.folio}`,
      subtitle: `${r.patient_name} · ${r.status}`,
      href: `/prescriptions/${r.id}`,
      badge: r.status,
    });
  }

  // 3. Pedidos web
  const orders = await all<{ id: number; folio: string; full_name: string; status: string; total: number }>(
    `SELECT o.id, o.folio, c.full_name, o.status, o.total
     FROM customer_orders o
     JOIN customer_accounts c ON c.id = o.customer_account_id
     WHERE o.folio ILIKE ? OR c.full_name ILIKE ? OR c.email ILIKE ?
     ORDER BY o.created_at DESC LIMIT 4`,
    like, like, like
  );
  for (const o of orders) {
    results.push({
      type: "order",
      id: o.id,
      title: `Pedido ${o.folio}`,
      subtitle: `${o.full_name} · $${o.total.toLocaleString("es-CL")} · ${o.status}`,
      href: `/web-orders/${o.id}`,
      badge: o.status,
    });
  }

  // 4. Recetas web (pacientes con receta subida)
  const webRx = await all<{ id: number; full_name: string; email: string; status: string }>(
    `SELECT id, full_name, email, prescription_status as status
     FROM customer_accounts
     WHERE prescription_status IN ('pending','aprobada','rechazada','expired')
       AND (full_name ILIKE ? OR email ILIKE ? OR rut ILIKE ?)
     ORDER BY prescription_uploaded_at DESC NULLS LAST LIMIT 4`,
    like, like, like
  );
  for (const w of webRx) {
    results.push({
      type: "prescription",
      id: w.id,
      title: `Receta web · ${w.full_name}`,
      subtitle: `${w.email} · ${w.status}`,
      href: `/web-prescriptions/${w.id}`,
      badge: w.status,
    });
  }

  // 5. Productos
  const products = await all<{ id: number; sku: string; name: string }>(
    `SELECT id, sku, name FROM products
     WHERE is_active=1 AND (name ILIKE ? OR sku ILIKE ?)
     ORDER BY name LIMIT 4`,
    like, like
  );
  for (const p of products) {
    results.push({
      type: "product",
      id: p.id,
      title: p.name,
      subtitle: `SKU ${p.sku}`,
      href: `/inventory?q=${encodeURIComponent(p.sku)}`,
    });
  }

  // 6. Embajadores (customer_accounts con is_ambassador=1)
  const ambassadors = await all<{ id: number; full_name: string; email: string; code: string | null }>(
    `SELECT c.id, c.full_name, c.email, rc.code
     FROM customer_accounts c
     LEFT JOIN referral_codes rc ON rc.ambassador_account_id = c.id
     WHERE c.is_ambassador = 1
       AND (c.full_name ILIKE ? OR c.email ILIKE ? OR rc.code ILIKE ?)
     LIMIT 4`,
    like, like, like
  );
  for (const a of ambassadors) {
    results.push({
      type: "ambassador",
      id: a.id,
      title: `Embajador · ${a.full_name}`,
      subtitle: `${a.email}${a.code ? " · código " + a.code : ""}`,
      href: `/ambassadors/${a.id}`,
    });
  }

  return NextResponse.json({ results, q, total: results.length });
}
