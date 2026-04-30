// Seed Cultisoft DB with REAL data from Cultimed Shopify exports.
//
// Modes (set via env CULTISOFT_SEED_MODE):
//   demo (default)  — also synthesizes ~35 prescriptions + ~60 dispensations spread over 30 days
//   clean           — only real identity (patients, products, batches, doctors). Empty rx/dispensations.
//                     Use this when going to production / starting real operation.
//
// Inputs:
//   scripts/source-data/customers.csv  (Shopify customer export)
//   scripts/source-data/products.csv   (Shopify product+variants export)
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("node:path");
const fs = require("node:fs");

const DB_PATH = process.env.DB_PATH || "./data/cultisoft.db";
const SEED_MODE = (process.env.CULTISOFT_SEED_MODE || "demo").toLowerCase();
const IS_CLEAN = SEED_MODE === "clean";
const CUSTOMERS_CSV = path.join(__dirname, "source-data", "customers.csv");
const PRODUCTS_CSV = path.join(__dirname, "source-data", "products.csv");

console.log(`▸ Seed mode: ${IS_CLEAN ? "CLEAN (production / no synthetic transactions)" : "DEMO (with synthetic prescriptions + dispensations)"}`);

const abs = path.isAbsolute(DB_PATH) ? DB_PATH : path.join(process.cwd(), DB_PATH);
if (!fs.existsSync(abs)) {
  console.error("✗ Database not found. Run `npm run db:init` first.");
  process.exit(1);
}

// ----- CSV PARSER (handles quoted fields with commas/newlines) -----
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function parseCSVFile(p) {
  const txt = fs.readFileSync(p, "utf8");
  const rows = parseCSV(txt);
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0];
  const records = rows.slice(1).filter((r) => r.some((v) => v && v.trim() !== ""));
  return { headers, records };
}

// ----- HELPERS -----
const isoDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};
const isoDaysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const dateOnlyDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Strip Shopify export's quote-prefixes (e.g. "'8673779155161")
const clean = (v) => {
  if (v === undefined || v === null) return "";
  const s = String(v).trim();
  return s.startsWith("'") ? s.slice(1) : s;
};

// Strip HTML tags from product descriptions
const stripHtml = (html) => {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
};

// Extract THC%/CBD% from description text
const extractCannabinoid = (text, key) => {
  if (!text) return null;
  const re = new RegExp(`${key}[^\\d<]*([<\\d.,–-]+)\\s*%`, "i");
  const m = text.match(re);
  if (!m) return null;
  // Take first numeric value
  const num = m[1].match(/[\d.]+/);
  if (!num) return null;
  const v = parseFloat(num[0]);
  return Number.isFinite(v) ? v : null;
};

// Determine product category by Shopify Type / Tags / Title
const categorize = (type, tags, title) => {
  const t = (type || "").toLowerCase();
  const tg = (tags || "").toLowerCase();
  const ti = (title || "").toLowerCase();
  // Aceites primero (CBD oil overlaps with cannabis tag)
  if (ti.includes("aceite") || tg.includes("aceite") || tg.includes(" oil") || tg.startsWith("oil"))
    return "aceite_cbd";
  if (ti.includes("cápsula") || ti.includes("capsula") || tg.includes("cápsula") || tg.includes("capsula"))
    return "capsulas";
  if (ti.includes("tópico") || ti.includes("topico") || ti.includes("bálsamo") || ti.includes("balsamo")
      || tg.includes("tópico") || tg.includes("topico"))
    return "topico";
  // Cannabis flower — Shopify Type is "Cannabis Medicinal" or "Flor de Cannabis", or tags/title include cannabis-related markers
  const cannabisMarkers = [
    "flor", "cannabis", "medicinal",
    "híbrido", "hibrido", "híbrida", "hibrida",
    "indica", "índica", "sativa",
    "preventa", "premium", "seeds",
    "exótica", "exotica",
    "euforia", "nocturna", "relajante",
  ];
  if (t.includes("flor") || t.includes("cannabis")) return "flores";
  if (cannabisMarkers.some((m) => tg.includes(m) || ti.includes(m))) return "flores";
  return "otro";
};

// Parse "5g" → 5 grams; "10ml" → 10 ml; otherwise "unidad"
const inferUnit = (option1Value, option1Name, productTitle, productType) => {
  const v = (option1Value || "").toLowerCase();
  const n = (option1Name || "").toLowerCase();
  const ptType = (productType || "").toLowerCase();
  if (n.includes("gramaje") || n.includes("peso") || /\d+\s*g\b/.test(v))
    return "gramo";
  if (/\d+\s*ml\b/.test(v) || /aceite/.test(productTitle.toLowerCase()))
    return "ml";
  if (ptType.includes("flor")) return "gramo";
  return "unidad";
};

// ----- LOAD DB -----
const db = new Database(abs);
db.pragma("foreign_keys = ON");

const seed = db.transaction(() => {
  // Wipe in dependency order
  db.exec(`
    DELETE FROM dispensation_items;
    DELETE FROM dispensations;
    DELETE FROM prescription_items;
    DELETE FROM prescriptions;
    DELETE FROM inventory_movements;
    DELETE FROM batches;
    DELETE FROM products;
    DELETE FROM doctors;
    DELETE FROM patients;
    DELETE FROM audit_logs;
    DELETE FROM staff;
  `);

  // ============ STAFF ============
  const insStaff = db.prepare(`
    INSERT INTO staff (email, password_hash, full_name, role, professional_license, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  const adminId = insStaff.run("admin@cultimed.cl", bcrypt.hashSync("admin123", 10), "Carolina Ramírez", "admin", null).lastInsertRowid;
  const dispId  = insStaff.run("farmacia@cultimed.cl", bcrypt.hashSync("farma123", 10), "Marcela Rojas", "dispenser", null).lastInsertRowid;
  const docStaffId = insStaff.run("dr.silva@cultimed.cl", bcrypt.hashSync("doctor123", 10), "Dr. Joaquín Silva", "doctor", "MED-12345").lastInsertRowid;
  const pharmId = insStaff.run("qf.morales@cultimed.cl", bcrypt.hashSync("quimico123", 10), "QF Andrea Morales", "pharmacist", "QF-78901").lastInsertRowid;

  // ============ EXTERNAL DOCTORS (synthetic — we don't have real data for prescribers) ============
  const insDoc = db.prepare(`
    INSERT INTO doctors (full_name, rut, professional_license, specialty, email, phone, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  const externalDoctors = [
    ["Dra. Patricia Soto Vergara",   "11.234.567-8", "MED-30122", "Neurología",          "p.soto@clinica.cl",            "+56 9 8123 4567"],
    ["Dr. Rodrigo Pérez Llanos",     "13.456.789-K", "MED-28991", "Medicina del Dolor",  "r.perez@centromedico.cl",      "+56 9 7234 5678"],
    ["Dra. Camila Astudillo Mira",   "15.678.901-2", "MED-31044", "Oncología",           "c.astudillo@hospital.cl",      "+56 9 6345 6789"],
    ["Dr. Ignacio Vidal Castro",     "12.987.654-3", "MED-29550", "Medicina General",    "i.vidal@privado.cl",           "+56 9 5456 7890"],
    ["Dra. Francisca Núñez Bravo",   "14.321.098-4", "MED-30877", "Reumatología",        "f.nunez@reumatologia.cl",      "+56 9 4567 8901"],
    ["Dr. Andrés Carrasco Lobos",    "16.789.012-5", "MED-31256", "Psiquiatría",         "a.carrasco@neuropsico.cl",     "+56 9 3678 9012"],
  ];
  const docIds = externalDoctors.map((d) => insDoc.run(...d).lastInsertRowid);

  // ============ PATIENTS (from real CSV) ============
  console.log(`▸ Loading customers from ${CUSTOMERS_CSV}…`);
  const cust = parseCSVFile(CUSTOMERS_CSV);
  const colC = Object.fromEntries(cust.headers.map((h, i) => [h.trim(), i]));

  const insPatient = db.prepare(`
    INSERT INTO patients (rut, full_name, date_of_birth, gender, email, phone, address, city,
      emergency_contact_name, emergency_contact_phone, allergies, chronic_conditions,
      membership_status, membership_started_at, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seenEmails = new Set();
  const seenRuts = new Set();
  const patientIds = [];
  let patientsImported = 0;
  let patientsSkipped = 0;

  for (const r of cust.records) {
    const customerId = clean(r[colC["Customer ID"]]);
    const firstName = clean(r[colC["First Name"]]);
    const lastName = clean(r[colC["Last Name"]]);
    const email = clean(r[colC["Email"]]).toLowerCase();
    const address1 = clean(r[colC["Default Address Address1"]]);
    const address2 = clean(r[colC["Default Address Address2"]]);
    const city = clean(r[colC["Default Address City"]]);
    const phone = clean(r[colC["Phone"]]) || clean(r[colC["Default Address Phone"]]);
    // NOTE: Total Spent / Total Orders columns in this Shopify export are CONTAMINATED
    // (per the user: amounts mixed across customers, orders that never were).
    // We deliberately ignore those fields and store no transactional history from them.
    const note = clean(r[colC["Note"]]); // sometimes contains RUT
    const tags = (clean(r[colC["Tags"]]) || "").toLowerCase();

    if (!email) { patientsSkipped++; continue; }
    if (seenEmails.has(email)) { patientsSkipped++; continue; }
    seenEmails.add(email);

    // Name fallback
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim()
      || email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    // Try to extract RUT from "Note" field
    let rut = "";
    if (note && /\d/.test(note)) {
      const m = note.match(/(\d{1,3}(?:\.\d{3})*-[0-9kK]|\d{7,9}-?[0-9kK])/);
      if (m) rut = m[1].toUpperCase();
    }
    if (!rut || seenRuts.has(rut)) {
      // Synthesize a placeholder RUT using customer ID
      rut = `CID-${customerId.slice(-8) || patientsImported}`;
    }
    seenRuts.add(rut);

    const address = [address1, address2].filter(Boolean).join(", ").trim() || null;
    const cityClean = city || null;

    // Membership status from Shopify tags
    const isApproved = tags.includes("aprobado");
    const membershipStatus = isApproved ? "active" : "pending";
    const memStarted = isApproved ? isoDaysAgo(randInt(30, 365)) : null;

    // Use note as miscellaneous notes (without RUT, without contaminated totals)
    const cleanNote = note && note !== rut ? note : null;

    const id = insPatient.run(
      rut,
      fullName,
      null,                  // dateOfBirth — not in CSV
      null,                  // gender — not in CSV
      email,
      phone || null,
      address,
      cityClean,
      null,                  // emergency_contact_name
      null,                  // emergency_contact_phone
      null,                  // allergies — clinical, will fill via UI
      null,                  // chronic conditions
      membershipStatus,
      memStarted,
      cleanNote,
      isoDaysAgo(randInt(30, 400)),
      isoDaysAgo(randInt(0, 30))
    ).lastInsertRowid;
    patientIds.push(id);
    patientsImported++;
  }
  console.log(`  ✓ ${patientsImported} patients imported, ${patientsSkipped} skipped (no email/duplicate)`);

  // ============ PRODUCTS + BATCHES (from real CSV) ============
  console.log(`▸ Loading products from ${PRODUCTS_CSV}…`);
  const prod = parseCSVFile(PRODUCTS_CSV);
  const colP = Object.fromEntries(prod.headers.map((h, i) => [h.trim(), i]));

  const insProduct = db.prepare(`
    INSERT INTO products (sku, name, category, presentation, active_ingredient, concentration,
      thc_percentage, cbd_percentage, unit, requires_prescription, is_controlled, default_price,
      description, vendor, is_house_brand, is_preorder, shopify_status, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  const insBatch = db.prepare(`
    INSERT INTO batches (product_id, batch_number, quantity_initial, quantity_current,
      cost_per_unit, price_per_unit, manufacture_date, expiry_date, supplier, status, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insMovIn = db.prepare(`
    INSERT INTO inventory_movements (batch_id, movement_type, quantity, reference_type,
      staff_id, reason, created_at)
    VALUES (?, 'in', ?, 'purchase', ?, ?, ?)
  `);

  // Group rows by Handle
  const byHandle = new Map();
  for (const r of prod.records) {
    const handle = clean(r[colP["Handle"]]);
    if (!handle) continue;
    if (!byHandle.has(handle)) byHandle.set(handle, []);
    byHandle.get(handle).push(r);
  }

  let productsImported = 0;
  let batchesImported = 0;
  const productIds = [];
  const batchIdsArr = [];   // [{ productId, batchId, sku, price, qty }]
  const productByCategory = { flores: [], aceite_cbd: [], capsulas: [], topico: [], otro: [] };

  for (const [handle, rows] of byHandle) {
    // Find first row with title (the master)
    const master = rows.find((r) => clean(r[colP["Title"]])) || rows[0];
    const title = clean(master[colP["Title"]]) || handle;
    const bodyHtml = clean(master[colP["Body (HTML)"]]);
    const vendor = clean(master[colP["Vendor"]]);
    const type = clean(master[colP["Type"]]);
    const tags = clean(master[colP["Tags"]]);
    const productStatus = (clean(master[colP["Status"]]) || "").toLowerCase();
    // Only Shopify "active" products go into the live catalog.
    // Skip 'archived', 'unlisted', 'draft' — they're not for sale.
    if (productStatus !== "active") continue;

    const description = stripHtml(bodyHtml).slice(0, 800);
    const category = categorize(type, tags, title);
    const thc = extractCannabinoid(bodyHtml, "THC");
    const cbd = extractCannabinoid(bodyHtml, "CBD");

    const isPreorder = /preventa|predispensado/i.test(title);

    // For each variant row, create a product+batch combination.
    // We model each variant as a separate "product" so dispensers can pick the gram size.
    for (const row of rows) {
      const variantSku = clean(row[colP["Variant SKU"]]);
      const option1Name = clean(row[colP["Option1 Name"]]) || clean(master[colP["Option1 Name"]]);
      const option1Value = clean(row[colP["Option1 Value"]]) || clean(row[colP["Option1 Value"]]);
      // CSV reflects current Shopify state (often near-zero for preventa).
      // Boost for demo: keep relative proportions but add a baseline so the system
      // has realistic stock that survives the simulated dispensations.
      const csvQty = parseInt(clean(row[colP["Variant Inventory Qty"]]) || "0", 10);
      const qty = csvQty > 0 ? csvQty * 5 + 25 : 30;  // ensures min 30 stock per batch
      const price = parseInt(clean(row[colP["Variant Price"]]) || "0", 10);
      const grams = parseFloat(clean(row[colP["Variant Grams"]]) || "0");

      if (!option1Value) continue;
      if (price <= 0) continue;

      const presentation = option1Value || (grams ? `${grams}g` : null);
      const sku = variantSku || `${handle.toUpperCase().replace(/[^A-Z0-9]/g, "-")}-${presentation}`;
      const productName = `${title} (${presentation})`;
      const unit = inferUnit(option1Value, option1Name, title, type);

      // Cannabis flower & oil products with high THC are controlled
      const isControlled = category === "flores" && thc !== null && thc > 5 ? 1 : 0;
      const requiresPrescription = category === "topico" ? 0 : 1;

      // Distinguish house brand from external breeders
      // "Cultimed" / "Cultimed Dispensario" vendor = línea propia
      // Type "Cannabis Medicinal" = línea propia (Cultimed)
      // Type "Flor de Cannabis" = breeder externo (Bloom, LIT Farms, Cookies, etc.)
      const vendorLower = (vendor || "").toLowerCase();
      const typeLower = (type || "").toLowerCase();
      const isHouseBrand = vendorLower.includes("cultimed") || typeLower.includes("cannabis medicinal") ? 1 : 0;

      let productId;
      try {
        productId = insProduct.run(
          sku,
          productName,
          category,
          presentation,
          category === "flores" ? "Cannabis sativa L." : (category === "aceite_cbd" ? "Cannabidiol" : (category === "capsulas" ? "Cannabidiol" : null)),
          [thc !== null ? `THC ${thc}%` : null, cbd !== null ? `CBD ${cbd}%` : null].filter(Boolean).join(" / ") || null,
          thc,
          cbd,
          unit,
          requiresPrescription,
          isControlled,
          price,
          description || null,
          vendor || null,
          isHouseBrand,
          isPreorder ? 1 : 0,
          productStatus,
          isoDaysAgo(randInt(30, 200))
        ).lastInsertRowid;
      } catch (e) {
        // Duplicate SKU — skip
        continue;
      }

      productIds.push(productId);
      productByCategory[category].push({ productId, sku, price });
      productsImported++;

      // Create one batch with the inventory qty (mfg/expiry inferred)
      const mfgDate = dateOnlyDaysAgo(randInt(30, 200));
      const expDate = isoDaysFromNow(randInt(180, 540));
      const batchNum = `${sku}-LOT-${Date.now().toString(36).toUpperCase().slice(-5)}-${batchesImported}`;
      const batchStatus = qty <= 0 ? "depleted" : "available";
      // CSV "Cost per item" is empty for all products in this export.
      // Use NULL rather than fabricate — staff can fill it in later.
      const csvCostStr = clean(row[colP["Cost per item"]]);
      const cost = csvCostStr && parseInt(csvCostStr, 10) > 0
        ? parseInt(csvCostStr, 10)
        : null;

      const batchId = insBatch.run(
        productId,
        batchNum,
        Math.max(qty, 0),
        Math.max(qty, 0),
        cost,
        price,
        mfgDate,
        expDate,
        vendor || "Cultimed Suppliers",
        batchStatus,
        null,
        isoDaysAgo(randInt(30, 100))
      ).lastInsertRowid;

      if (qty > 0) {
        insMovIn.run(
          batchId,
          qty,
          adminId,
          `Ingreso lote ${batchNum} de ${vendor || "proveedor"}`,
          isoDaysAgo(randInt(30, 100))
        );
      }

      batchIdsArr.push({ productId, batchId, sku, price, qty });
      batchesImported++;
    }
  }
  console.log(`  ✓ ${productsImported} products imported, ${batchesImported} batches`);

  // Helper: pick a batch to dispense from (with stock)
  const inStockBatches = batchIdsArr.filter((b) => b.qty > 0);

  // ============================================================
  // CLEAN MODE — stop here. No synthetic transactional data.
  // ============================================================
  if (IS_CLEAN) {
    console.log("");
    console.log("✓ CLEAN seed complete. Real identity only.");
    console.log("   - Recetas, dispensaciones e historial de inventario quedan vacíos.");
    console.log("   - El equipo va creando los datos reales desde la app.");
    console.log("");
    console.log("✓ Login credentials:");
    console.log("   admin@cultimed.cl     / admin123    (Administrador)");
    console.log("   farmacia@cultimed.cl  / farma123    (Dispensador)");
    console.log("   qf.morales@cultimed.cl / quimico123 (Químico Farmacéutico)");
    console.log("   dr.silva@cultimed.cl  / doctor123   (Doctor staff)");
    return;
  }

  // ============ PRESCRIPTIONS (DEMO MODE) ============
  // Sintetizamos recetas para ~30% de pacientes con productos cannabis. SOLO PARA DEMO.
  const insRx = db.prepare(`
    INSERT INTO prescriptions (folio, patient_id, doctor_id, diagnosis, diagnosis_code,
      issue_date, expiry_date, is_retained, status, verified_by, verified_at, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insRxItem = db.prepare(`
    INSERT INTO prescription_items (prescription_id, product_id, quantity_prescribed,
      quantity_dispensed, dosage_instructions)
    VALUES (?, ?, ?, ?, ?)
  `);

  const diagnoses = [
    { dx: "Lumbalgia crónica con componente neuropático", code: "M54.5" },
    { dx: "Dolor crónico postquimioterapia",              code: "G89.3" },
    { dx: "Insomnio crónico y ansiedad",                  code: "G47.0" },
    { dx: "Esclerosis múltiple - espasticidad",           code: "G35"   },
    { dx: "Migraña crónica refractaria",                  code: "G43.1" },
    { dx: "Dolor oncológico",                             code: "C80.1" },
    { dx: "Epilepsia refractaria",                        code: "G40.9" },
    { dx: "Trastorno de ansiedad generalizada",           code: "F41.1" },
    { dx: "Fibromialgia",                                  code: "M79.7" },
    { dx: "Estrés post-traumático",                       code: "F43.1" },
    { dx: "Glaucoma",                                     code: "H40.1" },
    { dx: "Artritis reumatoide",                          code: "M06.9" },
  ];

  const dosageOptions = [
    "5 gotas sublinguales cada 12h",
    "3 gotas sublinguales cada 8h con titulación gradual",
    "1 cápsula al acostarse",
    "0.25g vaporizado en crisis, máx 3 veces/día",
    "0.5g molido, vaporización nocturna",
    "Aplicación tópica cada 12h sobre zona afectada",
    "8 gotas cada 12h con escalada de 2 gotas semanales",
  ];

  let folioN = 2026001;
  const newRxFolio = () => `RX-2026-${(folioN++).toString().padStart(7, "0")}`;

  // Pick ~30% of patients to have a Rx
  const patientsForRx = patientIds.filter(() => Math.random() < 0.3);
  const rxIds = [];
  const cannabisProducts = [...productByCategory.flores, ...productByCategory.aceite_cbd, ...productByCategory.capsulas];

  for (const pid of patientsForRx) {
    if (cannabisProducts.length === 0) break;
    const dx = pick(diagnoses);
    const issued = randInt(1, 60);
    const expiresIn = randInt(30, 90);
    const retained = Math.random() < 0.4 ? 1 : 0;
    const statusRoll = Math.random();
    let status, verifiedBy, verifiedAt;
    if (statusRoll < 0.15) { status = "pending"; verifiedBy = null; verifiedAt = null; }
    else if (statusRoll < 0.85) { status = "active"; verifiedBy = pharmId; verifiedAt = isoDaysAgo(issued - 1); }
    else { status = "fulfilled"; verifiedBy = pharmId; verifiedAt = isoDaysAgo(issued - 1); }

    const id = insRx.run(
      newRxFolio(),
      pid,
      pick(docIds),
      dx.dx,
      dx.code,
      dateOnlyDaysAgo(issued),
      isoDaysFromNow(expiresIn),
      retained,
      status,
      verifiedBy,
      verifiedAt,
      null,
      isoDaysAgo(issued)
    ).lastInsertRowid;
    rxIds.push({ id, patientId: pid, status });

    // 1-2 items
    const itemCount = Math.random() < 0.7 ? 1 : 2;
    const usedSkus = new Set();
    for (let k = 0; k < itemCount; k++) {
      const item = pick(cannabisProducts);
      if (usedSkus.has(item.sku)) continue;
      usedSkus.add(item.sku);
      insRxItem.run(id, item.productId, randInt(1, 3), 0, pick(dosageOptions));
    }
  }
  console.log(`  ✓ ${rxIds.length} prescriptions synthesized`);

  // ============ DISPENSATIONS ============
  // Build dispensations distributed across last 30 days, with some today.
  const insDisp = db.prepare(`
    INSERT INTO dispensations (folio, patient_id, prescription_id, dispenser_id, total_amount,
      payment_method, payment_status, status, notes, dispensed_at)
    VALUES (?, ?, ?, ?, ?, ?, 'paid', 'completed', ?, ?)
  `);
  const insDispItem = db.prepare(`
    INSERT INTO dispensation_items (dispensation_id, batch_id, product_id, quantity, price_per_unit, total_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const updateBatchQty = db.prepare(`
    UPDATE batches SET quantity_current = quantity_current - ?,
      status = CASE WHEN quantity_current - ? <= 0 THEN 'depleted' ELSE status END
    WHERE id = ? AND quantity_current >= ?
  `);
  const insMovOut = db.prepare(`
    INSERT INTO inventory_movements (batch_id, movement_type, quantity, reference_type, reference_id,
      staff_id, reason, created_at)
    VALUES (?, 'out', ?, 'dispensation', ?, ?, ?, ?)
  `);
  const updateRxItem = db.prepare(`
    UPDATE prescription_items SET quantity_dispensed = quantity_dispensed + ?
    WHERE prescription_id = ? AND product_id = ?
  `);

  let dispCounter = 5001;
  const newDispFolio = () => `DISP-2026-${(dispCounter++).toString().padStart(5, "0")}`;

  // Mutable in-memory stock map to avoid over-dispensing
  const stockMap = new Map(batchIdsArr.map((b) => [b.batchId, b.qty]));

  function tryDispense(batchEntry, qty) {
    const cur = stockMap.get(batchEntry.batchId) ?? 0;
    if (cur < qty) return false;
    stockMap.set(batchEntry.batchId, cur - qty);
    return true;
  }

  let dispCount = 0;
  const today = new Date();
  const dispensers = [dispId, pharmId, adminId];

  // Distribute ~60 dispensations over the last 30 days (skewed toward today)
  for (let i = 0; i < 60; i++) {
    const patient = patientIds[Math.floor(Math.random() * patientIds.length)];
    if (!patient) break;
    if (inStockBatches.length === 0) break;

    // Compose timestamp: ~25% today, rest spread last 30 days
    let dispensedAt;
    if (Math.random() < 0.25) {
      const d = new Date(today);
      d.setHours(randInt(8, 19), randInt(0, 59), 0, 0);
      dispensedAt = d.toISOString();
    } else {
      const days = randInt(1, 30);
      const d = new Date();
      d.setDate(d.getDate() - days);
      d.setHours(randInt(9, 18), randInt(0, 59), 0, 0);
      dispensedAt = d.toISOString();
    }

    // 1-3 items per dispensation
    const itemCount = Math.random() < 0.5 ? 1 : Math.random() < 0.85 ? 2 : 3;
    const items = [];
    let total = 0;
    const used = new Set();

    for (let k = 0; k < itemCount; k++) {
      // Pick a batch with stock
      const candidates = batchIdsArr.filter((b) => (stockMap.get(b.batchId) ?? 0) > 0 && !used.has(b.batchId));
      if (candidates.length === 0) break;
      const b = candidates[Math.floor(Math.random() * candidates.length)];
      const qty = Math.min(stockMap.get(b.batchId), randInt(1, 2));
      if (qty <= 0) continue;
      if (!tryDispense(b, qty)) continue;
      used.add(b.batchId);
      items.push({ ...b, qty });
      total += b.price * qty;
    }
    if (items.length === 0) continue;

    // Find a matching active Rx for this patient if any
    const matchingRx = rxIds.find((r) => r.patientId === patient && r.status === "active");

    const id = insDisp.run(
      newDispFolio(),
      patient,
      matchingRx ? matchingRx.id : null,
      pick(dispensers),
      total,
      pick(["efectivo", "tarjeta", "transferencia"]),
      null,
      dispensedAt
    ).lastInsertRowid;

    for (const it of items) {
      insDispItem.run(id, it.batchId, it.productId, it.qty, it.price, it.price * it.qty);
      updateBatchQty.run(it.qty, it.qty, it.batchId, it.qty);
      insMovOut.run(it.batchId, -it.qty, id, dispId, "Dispensación", dispensedAt);
      if (matchingRx) updateRxItem.run(it.qty, matchingRx.id, it.productId);
    }
    dispCount++;
  }
  console.log(`  ✓ ${dispCount} dispensations created`);

  // Force a few batches into low-stock state so dashboard alerts are meaningful in demo
  const setQty = db.prepare(`UPDATE batches SET quantity_current = ? WHERE id = ?`);
  const lowStockSelections = batchIdsArr
    .filter((b) => (stockMap.get(b.batchId) || 0) > 8)
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);
  for (const b of lowStockSelections) {
    const target = randInt(1, 4);
    setQty.run(target, b.batchId);
    stockMap.set(b.batchId, target);
  }
  console.log(`  ✓ ${lowStockSelections.length} batches forced into low-stock for demo`);

  // Summary
  console.log("");
  console.log("✓ Seed complete with REAL Cultimed data.");
  console.log("");
  console.log("✓ Login credentials:");
  console.log("   admin@cultimed.cl     / admin123    (Administrador)");
  console.log("   farmacia@cultimed.cl  / farma123    (Dispensador)");
  console.log("   qf.morales@cultimed.cl / quimico123 (Químico Farmacéutico)");
  console.log("   dr.silva@cultimed.cl  / doctor123   (Doctor staff)");
});

seed();
db.close();
