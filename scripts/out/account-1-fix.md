# Account #1 — rincondeoz@gmail.com

**Investigated:** 2026-06-19  
**Script:** `scripts/_investigate-account-1.mjs` (one-off)

## DB record

| Field | Value |
|-------|-------|
| `customer_accounts.id` | 1 |
| `email` | rincondeoz@gmail.com |
| `full_name` | Oscar Ivan Zambrano Donaire |
| `rut` | 18.055.305-3 |
| `patient_id` | 108 |
| `prescription_status` | **aprobada** |
| `prescription_url` | `/uploads/prescriptions/1/1777371128027-bc706fbc.png` |
| `id_front_url` | NULL |
| `created_at` | 2026-04-28 |
| `updated_at` | 2026-06-06 |

### Linked patient (#108)

| Field | Value |
|-------|-------|
| `membership_status` | **active** |
| `email` | rincondeoz@gmail.com |
| `rut` | 18.055.305-3 |

## Root cause

`prescription_url` uses **legacy filesystem format** (`/uploads/...`), not Supabase Storage ref (`patient-documents://…` or `prescriptions://…`).

- `batch-ocr-prescriptions.mjs` resolves legacy paths via `STORE_PUBLIC_BASE` + path → `https://dispensariocultimed.cl/uploads/prescriptions/1/1777371128027-bc706fbc.png`
- **HTTP 404** — file does not exist on production store
- Supabase buckets checked: `patient-documents/1`, `prescriptions/1`, `documents/1` → **0 objects**
- Local workspace has no `uploads/prescriptions/` directory (never migrated)

This is the **super-admin / E2E test account** (`setup-e2e-customer.js`, skipped in Shopify migration). The account was created before Supabase Storage migration; the original upload lived on local/dev filesystem and was never copied to Storage.

## Impact

| System | Effect |
|--------|--------|
| Batch OCR | `[FAIL] download failed: HTTP 404` |
| Compliance audit | Listed under "missing id_front" (not missing prescription_url — URL is set but broken) |
| Store checkout | **OK** — `prescription_status=aprobada` allows orders |
| CultiSoft dispensation | **OK** — patient #108 is active; no dependency on web prescription file for in-store flow |

## Fix options

### Option A — Re-upload via store (recommended for prod realism)

1. Log in as rincondeoz@gmail.com on dispensariocultimed.cl
2. Upload a new prescription image in account settings
3. Staff approves if needed (already aprobada, may auto-approve)
4. Verify DB shows `patient-documents://1/…` format
5. Re-run `node scripts/batch-ocr-prescriptions.mjs --limit 1 --apply --force`

**Pros:** Uses normal flow, fixes Storage ref format  
**Cons:** Requires manual upload

### Option B — Manual Supabase upload + DB update

1. Upload PNG/PDF to bucket `patient-documents`, path `1/<timestamp>_receta.png`
2. Update DB:
   ```sql
   UPDATE customer_accounts
   SET prescription_url = 'patient-documents://1/<timestamp>_receta.png',
       updated_at = NOW()
   WHERE id = 1;
   ```
3. Re-run batch OCR

**Pros:** Fast, no UI needed  
**Cons:** Bypasses approval workflow audit trail

### Option C — Exclude from batch OCR (test account only)

Add account #1 to a skip list in `batch-ocr-prescriptions.mjs` (alongside other admin/test emails).

**Pros:** Stops noise in OCR reports  
**Cons:** Does not fix the broken URL; staff panel may still 404 when viewing prescription

### Option D — Create internal prescription in CultiSoft

Create an active `prescriptions` row for patient #108 with valid folio/expiry.

**Pros:** Satisfies compliance for in-store dispensations  
**Cons:** Does not fix web account OCR or store prescription viewer

### Option E — Clear broken URL (not recommended)

Set `prescription_url = NULL` and optionally `prescription_status = 'none'`.

**Cons:** Breaks aprobada status, blocks store orders, worsens compliance. **Do not use** unless intentionally deactivating test account.

## Recommendation

**Option A or B** for a permanent fix. Given this is the super-admin E2E account, **Option C** is acceptable short-term to unblock OCR batch runs, combined with **Option B** when a test prescription file is available.

Also upload `id_front_url` — compliance audit flags missing ID document for patient #1.

## Verification checklist

- [ ] `prescription_url` starts with `patient-documents://` or `prescriptions://`
- [ ] `node scripts/audit-prescription-urls.mjs` shows account #1 as `ok`
- [ ] `node scripts/batch-ocr-prescriptions.mjs --limit 1 --apply` succeeds for account #1
- [ ] Staff can view prescription in CultiSoft web-prescriptions panel