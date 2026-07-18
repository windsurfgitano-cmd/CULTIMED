// scripts/seed-cream-caramel.js
//
// Carga (o actualiza) la cepa Cream Caramel F1 Fast Version como producto EN RESERVA:
// is_preorder = 1, publicado, y SIN lotes — o sea 0 stock. Es el caso de uso de
// "reserva en firme": el paciente ve la ficha completa y puede reservarla a su nombre,
// pero no puede comprarla ni pagarla (ver lib/availability.ts -> isPurchasable).
//
// A proposito NO se cargan batches: el producto tiene que quedar con stock 0.
//
// Uso: node scripts/seed-cream-caramel.js   (desde cultimed-store/)
// Seguro de re-ejecutar: ON CONFLICT (sku) DO UPDATE, nunca duplica.
//
// OJO al re-ejecutar: el script vuelve a dejar el producto en estado de reserva
// (is_preorder = 1, is_active = 1, shopify_status = 'active'). Si el lote ya llego y
// alguien apago la preventa desde el panel, correr esto de nuevo la vuelve a prender.
// El precio SI se respeta: si ya tiene uno cargado no se pisa (ver COALESCE abajo).

const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const envPath = path.join(__dirname, "..", ".env.local");
const envText = fs.readFileSync(envPath, "utf8");
const match = envText.match(/^DATABASE_URL=(.*)$/m);
if (!match) throw new Error("DATABASE_URL no encontrado en .env.local");
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, "");

const sql = postgres(DATABASE_URL, { ssl: "require", prepare: false });

const SKU = "cream-caramel-f1-fast-version";

// La descripcion se renderiza partida por ". " (un <p> por oracion) en
// app/productos/[slug]/page.tsx:461 — por eso va como prosa corrida y no con
// titulos de seccion ni saltos de linea, que ahi quedarian pegados a la oracion
// siguiente. Los primeros 280 caracteres se usan como bajada en la ficha.
const DESCRIPTION = [
  "Híbrido F1 de dominancia índica desarrollado por el criador español Sweet Seeds bajo la referencia SWS40, obtenido del cruce entre Cream Caramel y Cream Caramel Auto.",
  "Es una variedad feminizada y fotodependiente, con un ratio aproximado de 90% índica y 10% sativa.",
  "El criador informa un contenido de THC de 15-20% y un CBD cercano a 1,2%; la potencia definitiva se confirma con el análisis del lote antes de dispensar.",
  "En cultivo interior completa su floración en torno a 7 semanas, con rendimientos de 450 a 600 gramos por metro cuadrado, mientras que en exterior alcanza entre 500 y 800 gramos por planta.",
  "Su perfil aromático es dulce y acaramelado, con un fondo terroso y de humus y matices gomosos y queseros.",
  "Los efectos descritos son principalmente relajantes, con estímulo de la creatividad, aumento del apetito y una sensación general de bienestar.",
  "Esta cepa se encuentra en reserva: todavía no tenemos lote disponible para dispensar, así que puedes dejarla registrada a tu nombre sin pago ni compromiso de compra.",
  "Te avisaremos por correo cuando ingrese el lote, y recién en ese momento se definen precio y formato de dispensación.",
].join(" ");

(async () => {
  const [row] = await sql`
    INSERT INTO products (
      sku, name, category, presentation, active_ingredient,
      thc_percentage, cbd_percentage, unit,
      requires_prescription, is_controlled, default_price, description,
      strain_key, vendor, is_house_brand, is_preorder, shopify_status, is_active
    ) VALUES (
      ${SKU},
      'Cream Caramel F1 Fast Version',
      'flores',
      'Flor a granel',
      'Cannabis sativa L.',
      -- thc_percentage es NUMERIC (un solo valor) pero el THC real de esta cepa es un
      -- RANGO de 15-20%. Guardamos 15, el piso garantizado: en un dispensario medicinal
      -- prometer de menos y entregar de mas es el unico error aceptable. El rango completo
      -- queda escrito en la description para que el paciente lo lea sin ambiguedad.
      15,
      1.2,
      'gramo',
      1,           -- requires_prescription
      0,           -- is_controlled (mismo criterio que el resto de las flores)
      NULL,        -- default_price: todavia sin precio, la reserva no se paga
      ${DESCRIPTION},
      ${SKU},      -- strain_key = sku: cepa propia, sin variantes hermanas
      'Sweet Seeds',
      0,           -- is_house_brand: Sweet Seeds es el criador, no linea Cultimed
      1,           -- is_preorder: EN RESERVA
      'active',
      1            -- is_active
    )
    ON CONFLICT (sku) DO UPDATE SET
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      presentation = EXCLUDED.presentation,
      active_ingredient = EXCLUDED.active_ingredient,
      thc_percentage = EXCLUDED.thc_percentage,
      cbd_percentage = EXCLUDED.cbd_percentage,
      unit = EXCLUDED.unit,
      requires_prescription = EXCLUDED.requires_prescription,
      is_controlled = EXCLUDED.is_controlled,
      -- No pisamos un precio ya cargado a mano desde el panel.
      default_price = COALESCE(products.default_price, EXCLUDED.default_price),
      description = EXCLUDED.description,
      strain_key = EXCLUDED.strain_key,
      vendor = EXCLUDED.vendor,
      is_house_brand = EXCLUDED.is_house_brand,
      is_preorder = EXCLUDED.is_preorder,
      shopify_status = EXCLUDED.shopify_status,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    RETURNING id, sku, name, is_preorder, is_active, shopify_status, default_price`;

  console.log("✓ producto:", JSON.stringify(row));

  // Verificacion: stock derivado de batches (no hay columna stock).
  const [check] = await sql`
    SELECT p.id, p.sku, p.is_preorder, p.is_active, p.shopify_status, p.default_price,
           p.thc_percentage, p.cbd_percentage, p.vendor, p.strain_key,
           COALESCE((SELECT SUM(b.quantity_current) FROM batches b
                     WHERE b.product_id = p.id AND b.status = 'available'), 0) AS stock
    FROM products p WHERE p.sku = ${SKU}`;

  console.log("✓ verificacion:", JSON.stringify(check));
  console.log(
    Number(check.is_preorder) === 1 && Number(check.stock) === 0
      ? "✓ OK: is_preorder = 1 y stock = 0 (producto en reserva, no comprable)"
      : "✗ ESTADO INESPERADO: revisar is_preorder / stock"
  );

  await sql.end();
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
