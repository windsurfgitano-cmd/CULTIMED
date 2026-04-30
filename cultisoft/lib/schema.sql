-- ============================================
-- CULTISOFT DB SCHEMA (SQLite)
-- Internal dispensary management system
-- ============================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Staff users (login)
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'dispenser', -- 'admin' | 'doctor' | 'dispenser' | 'pharmacist'
  professional_license TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Patients
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rut TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  date_of_birth TEXT,
  gender TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  allergies TEXT,
  chronic_conditions TEXT,
  notes TEXT,
  membership_status TEXT NOT NULL DEFAULT 'active', -- active | pending | suspended
  membership_started_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- External prescribing doctors
CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  rut TEXT UNIQUE,
  professional_license TEXT UNIQUE NOT NULL,
  specialty TEXT,
  email TEXT,
  phone TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Product catalog
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- farmaceutico | aceite_cbd | flores | capsulas | topico | otro
  presentation TEXT,
  active_ingredient TEXT,
  concentration TEXT,
  thc_percentage REAL,
  cbd_percentage REAL,
  unit TEXT NOT NULL DEFAULT 'unidad',
  requires_prescription INTEGER NOT NULL DEFAULT 1,
  is_controlled INTEGER NOT NULL DEFAULT 0,  -- receta retenida (estupefacientes)
  default_price INTEGER, -- CLP
  description TEXT,
  vendor TEXT,                    -- breeder/proveedor: "Bloom Seed Co.", "LIT Farms", etc.
  is_house_brand INTEGER NOT NULL DEFAULT 0, -- 1 = línea propia Cultimed (vs breeder externo)
  is_preorder INTEGER NOT NULL DEFAULT 0,    -- 1 = (PREVENTA) o (PREDISPENSADO)
  shopify_status TEXT,                       -- active | archived | unlisted | draft (al momento del seed)
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Batches (lots) of products
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_number TEXT NOT NULL,
  quantity_initial INTEGER NOT NULL,
  quantity_current INTEGER NOT NULL,
  cost_per_unit INTEGER,
  price_per_unit INTEGER NOT NULL,
  manufacture_date TEXT,
  expiry_date TEXT,
  supplier TEXT,
  coa_url TEXT,
  status TEXT NOT NULL DEFAULT 'available', -- available | depleted | recalled | expired
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, batch_number)
);

-- Prescriptions
CREATE TABLE IF NOT EXISTS prescriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT UNIQUE NOT NULL,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  diagnosis TEXT,
  diagnosis_code TEXT,
  issue_date TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  document_url TEXT,
  is_retained INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- pending | active | expired | fulfilled | rejected
  verified_by INTEGER REFERENCES staff(id),
  verified_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Items prescribed in each prescription
CREATE TABLE IF NOT EXISTS prescription_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_prescribed INTEGER NOT NULL,
  quantity_dispensed INTEGER NOT NULL DEFAULT 0,
  dosage_instructions TEXT
);

-- Dispensations (sales / dispensing events)
CREATE TABLE IF NOT EXISTS dispensations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT UNIQUE NOT NULL,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE RESTRICT,
  dispenser_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  total_amount INTEGER NOT NULL,
  payment_method TEXT,                -- efectivo | tarjeta | transferencia
  payment_status TEXT NOT NULL DEFAULT 'paid',
  status TEXT NOT NULL DEFAULT 'completed', -- pending | completed | cancelled | returned
  notes TEXT,
  dispensed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Items dispensed (links batches consumed)
CREATE TABLE IF NOT EXISTS dispensation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispensation_id INTEGER NOT NULL REFERENCES dispensations(id) ON DELETE CASCADE,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  price_per_unit INTEGER NOT NULL,
  total_price INTEGER NOT NULL
);

-- Inventory movements (stock audit trail)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL, -- in | out | adjustment | return | recall
  quantity INTEGER NOT NULL,   -- positive in, negative out
  reference_type TEXT,          -- dispensation | purchase | manual
  reference_id INTEGER,
  staff_id INTEGER REFERENCES staff(id),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Audit log for compliance
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER REFERENCES staff(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_patients_rut ON patients(rut);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(full_name);
CREATE INDEX IF NOT EXISTS idx_batches_product ON batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_dispensations_patient ON dispensations(patient_id);
CREATE INDEX IF NOT EXISTS idx_dispensations_dispensed_at ON dispensations(dispensed_at);
CREATE INDEX IF NOT EXISTS idx_inv_movements_batch ON inventory_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
