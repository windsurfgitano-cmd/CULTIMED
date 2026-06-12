-- Migración 004: columnas para documentos de registro
-- Foto carnet (frente/dorso), antecedentes penales, cesión de derechos

ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS id_front_url TEXT,
  ADD COLUMN IF NOT EXISTS id_back_url TEXT,
  ADD COLUMN IF NOT EXISTS criminal_record_url TEXT,
  ADD COLUMN IF NOT EXISTS rights_assignment_url TEXT;
