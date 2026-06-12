-- Migración 003: índices faltantes + updated_at en products + trigger auto

-- =============== 1. ÍNDICES FALTANTES ===============

CREATE INDEX IF NOT EXISTS idx_customer_accounts_rut ON customer_accounts(rut);
CREATE INDEX IF NOT EXISTS idx_customer_accounts_prescription_status ON customer_accounts(prescription_status);

-- =============== 2. updated_at en products ===============

ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- =============== 3. TRIGGER auto-update updated_at ===============

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas que tienen columna updated_at
-- (solo si no existe ya el trigger)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_patients_updated_at') THEN
    CREATE TRIGGER trg_patients_updated_at
      BEFORE UPDATE ON patients
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_products_updated_at') THEN
    CREATE TRIGGER trg_products_updated_at
      BEFORE UPDATE ON products
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prescriptions_updated_at') THEN
    CREATE TRIGGER trg_prescriptions_updated_at
      BEFORE UPDATE ON prescriptions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_customer_accounts_updated_at') THEN
    CREATE TRIGGER trg_customer_accounts_updated_at
      BEFORE UPDATE ON customer_accounts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_customer_orders_updated_at') THEN
    CREATE TRIGGER trg_customer_orders_updated_at
      BEFORE UPDATE ON customer_orders
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
