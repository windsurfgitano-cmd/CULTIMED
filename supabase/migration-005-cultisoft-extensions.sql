-- Migración 005: extensiones cultisoft (2FA staff, embajadores, password reset)

-- Staff 2FA TOTP
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS totp_secret TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Embajadores en cuentas web
ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS is_ambassador SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ambassador_invited_by BIGINT REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS ambassador_invited_at TIMESTAMPTZ;

-- Tokens de recuperación de contraseña (store + staff)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  account_type TEXT NOT NULL, -- 'customer' | 'staff'
  account_id BIGINT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_account ON password_reset_tokens(account_type, account_id);