-- ============================================
-- CULTIMED · Schema Postgres (Supabase)
-- ============================================
-- Combina lo que en SQLite estaba en:
--   cultisoft/lib/schema.sql
--   cultimed-store/scripts/extend-schema.js
--   cultimed-store/scripts/extend-schema-referrals.js
--   cultimed-store/scripts/extend-schema-payments.js
-- ============================================

-- =============== STAFF & PATIENTS ============

CREATE TABLE IF NOT EXISTS staff (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'dispenser', -- 'admin' | 'doctor' | 'dispenser' | 'pharmacist'
  professional_license TEXT,
  is_active SMALLINT NOT NULL DEFAULT 1,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
  id BIGSERIAL PRIMARY KEY,
  rut TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  date_of_birth DATE,
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
  membership_status TEXT NOT NULL DEFAULT 'active',
  membership_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctors (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  rut TEXT UNIQUE,
  professional_license TEXT UNIQUE NOT NULL,
  specialty TEXT,
  email TEXT,
  phone TEXT,
  is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============== PRODUCTS & BATCHES ==========

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  presentation TEXT,
  active_ingredient TEXT,
  concentration TEXT,
  thc_percentage NUMERIC,
  cbd_percentage NUMERIC,
  unit TEXT NOT NULL DEFAULT 'unidad',
  requires_prescription SMALLINT NOT NULL DEFAULT 1,
  is_controlled SMALLINT NOT NULL DEFAULT 0,
  default_price INTEGER,
  description TEXT,
  vendor TEXT,
  is_house_brand SMALLINT NOT NULL DEFAULT 0,
  is_preorder SMALLINT NOT NULL DEFAULT 0,
  shopify_status TEXT,
  is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS batches (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_number TEXT NOT NULL,
  quantity_initial INTEGER NOT NULL,
  quantity_current INTEGER NOT NULL,
  cost_per_unit INTEGER,
  price_per_unit INTEGER NOT NULL,
  manufacture_date DATE,
  expiry_date DATE,
  supplier TEXT,
  coa_url TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, batch_number)
);

-- =============== PRESCRIPTIONS ===============

CREATE TABLE IF NOT EXISTS prescriptions (
  id BIGSERIAL PRIMARY KEY,
  folio TEXT UNIQUE NOT NULL,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  diagnosis TEXT,
  diagnosis_code TEXT,
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  document_url TEXT,
  is_retained SMALLINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  verified_by BIGINT REFERENCES staff(id),
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id BIGSERIAL PRIMARY KEY,
  prescription_id BIGINT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_prescribed INTEGER NOT NULL,
  quantity_dispensed INTEGER NOT NULL DEFAULT 0,
  dosage_instructions TEXT
);

-- =============== DISPENSATIONS (mostrador) ===

CREATE TABLE IF NOT EXISTS dispensations (
  id BIGSERIAL PRIMARY KEY,
  folio TEXT UNIQUE NOT NULL,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  prescription_id BIGINT REFERENCES prescriptions(id) ON DELETE RESTRICT,
  dispenser_id BIGINT NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  total_amount INTEGER NOT NULL,
  payment_method TEXT,
  payment_status TEXT NOT NULL DEFAULT 'paid',
  status TEXT NOT NULL DEFAULT 'completed',
  notes TEXT,
  dispensed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dispensation_items (
  id BIGSERIAL PRIMARY KEY,
  dispensation_id BIGINT NOT NULL REFERENCES dispensations(id) ON DELETE CASCADE,
  batch_id BIGINT NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  price_per_unit INTEGER NOT NULL,
  total_price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reference_type TEXT,
  reference_id BIGINT,
  staff_id BIGINT REFERENCES staff(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============== AUDIT LOG ===================

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT REFERENCES staff(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id BIGINT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============== CUSTOMER ACCOUNTS (storefront)

CREATE TABLE IF NOT EXISTS customer_accounts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  rut TEXT,
  phone TEXT,
  patient_id BIGINT REFERENCES patients(id),
  prescription_status TEXT NOT NULL DEFAULT 'none',
  prescription_url TEXT,
  prescription_uploaded_at TIMESTAMPTZ,
  prescription_reviewed_by BIGINT REFERENCES staff(id),
  prescription_reviewed_at TIMESTAMPTZ,
  prescription_reviewer_notes TEXT,
  age_gate_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_orders (
  id BIGSERIAL PRIMARY KEY,
  folio TEXT UNIQUE NOT NULL,
  customer_account_id BIGINT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  subtotal INTEGER NOT NULL,
  total INTEGER NOT NULL,
  shipping_address TEXT,
  shipping_city TEXT,
  shipping_region TEXT,
  shipping_phone TEXT,
  shipping_method TEXT DEFAULT 'pickup',
  shipping_tracking TEXT,
  notes TEXT,
  payment_method TEXT DEFAULT 'transfer',
  payment_proof_url TEXT,
  payment_proof_uploaded_at TIMESTAMPTZ,
  payment_confirmed_by BIGINT REFERENCES staff(id),
  payment_confirmed_at TIMESTAMPTZ,
  payment_rejection_reason TEXT,
  whatsapp_sent_at TIMESTAMPTZ,
  -- Referrals
  referral_conversion_id BIGINT,
  referral_discount_amount INTEGER NOT NULL DEFAULT 0,
  -- Payments
  payment_discount_amount INTEGER NOT NULL DEFAULT 0,
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  mp_status TEXT,
  mp_init_point TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_id BIGINT REFERENCES batches(id),
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  total_price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT,
  staff_id BIGINT REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============== REFERRALS / EMBAJADORES =====

CREATE TABLE IF NOT EXISTS referral_codes (
  id BIGSERIAL PRIMARY KEY,
  ambassador_account_id BIGINT NOT NULL UNIQUE REFERENCES customer_accounts(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  is_active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ambassador_bank_info (
  ambassador_account_id BIGINT PRIMARY KEY REFERENCES customer_accounts(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  account_holder_rut TEXT NOT NULL,
  contact_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_conversions (
  id BIGSERIAL PRIMARY KEY,
  code_id BIGINT NOT NULL REFERENCES referral_codes(id) ON DELETE RESTRICT,
  ambassador_account_id BIGINT NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  referred_account_id BIGINT NOT NULL UNIQUE REFERENCES customer_accounts(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prescription_approved_at TIMESTAMPTZ,
  first_order_id BIGINT REFERENCES customer_orders(id),
  first_order_paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  cancelled_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_payouts (
  id BIGSERIAL PRIMARY KEY,
  ambassador_account_id BIGINT NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_amount INTEGER NOT NULL,
  bank_reference TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ,
  paid_by BIGINT REFERENCES staff(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_commissions (
  id BIGSERIAL PRIMARY KEY,
  conversion_id BIGINT NOT NULL REFERENCES referral_conversions(id) ON DELETE RESTRICT,
  ambassador_account_id BIGINT NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  order_id BIGINT NOT NULL REFERENCES customer_orders(id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  base_amount INTEGER NOT NULL,
  rate_bps INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  payout_id BIGINT REFERENCES referral_payouts(id),
  status TEXT NOT NULL DEFAULT 'pending',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, type)
);

-- =============== INDICES =====================

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

CREATE INDEX IF NOT EXISTS idx_customer_orders_account ON customer_orders(customer_account_id);
CREATE INDEX IF NOT EXISTS idx_customer_orders_status ON customer_orders(status);
CREATE INDEX IF NOT EXISTS idx_customer_orders_created ON customer_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_customer_order_items_order ON customer_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_order_events_order ON customer_order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_accounts_email ON customer_accounts(email);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_amb ON referral_conversions(ambassador_account_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_referred ON referral_conversions(referred_account_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_status ON referral_conversions(status);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_amb ON referral_commissions(ambassador_account_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_status ON referral_commissions(status);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_payout ON referral_commissions(payout_id);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_amb ON referral_payouts(ambassador_account_id);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_status ON referral_payouts(status);
