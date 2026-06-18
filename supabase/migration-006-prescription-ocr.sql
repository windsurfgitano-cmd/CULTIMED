-- Migración 006: datos OCR de recetas en cuentas web

ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS prescription_ocr_data JSONB,
  ADD COLUMN IF NOT EXISTS prescription_ocr_at TIMESTAMPTZ;