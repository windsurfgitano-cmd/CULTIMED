# CultiSoft / Cultimed QA Runbook

## Estado operativo verificado

Última auditoría local/producción ejecutada con:

```bash
node scripts/qa-full-check.mjs
```

El full check hace:

1. `npm run build` en `cultimed-store`.
2. `npm run build` en `cultisoft`.
3. `node scripts/smoke-test.mjs` contra producción.
4. `node scripts/e2e-full-flow-direct.mjs` con datos temporales y rollback.

## Smoke público/admin

```bash
node scripts/smoke-test.mjs
```

Valida:

- health store/admin con DB viva.
- páginas públicas del store.
- rutas privadas redirigen sin sesión.
- APIs admin sensibles responden `401` sin auth.
- cron endpoints bloquean sin token.

Resultado esperado:

```txt
40 passed, 0 failed
```

## E2E completo directo DB/API

```bash
node scripts/e2e-full-flow-direct.mjs
```

Flujo cubierto:

1. crea paciente temporal.
2. crea cuenta cliente temporal.
3. sube 5 documentos fake a Supabase Storage.
4. deja receta/documentos en `pending`.
5. verifica que no puede comprar antes de aprobación.
6. aprueba con staff activo.
7. crea orden web.
8. confirma pago.
9. descuenta inventario.
10. verifica health store/admin.
11. rollback total:
    - elimina orden temporal.
    - elimina cuenta temporal.
    - elimina paciente temporal.
    - elimina objetos de Storage temporales.
    - compensa stock con movimiento auditable.

Resultado esperado:

```json
{ "ok": true }
```

## Inventario duro vigente

Conteo duro desde 2026-06-22:

- Bourbon Street: `200g`
- Gaslight Purple Ghost: `200g`

Implementación actual:

- Bourbon Street 10g: `20 unidades`
- Gaslight Purple Ghost 10g: `20 unidades`
- Presentaciones 5g/20g de esos strains: `0`, status `depleted`.

Verificación rápida:

```bash
node scripts/e2e-full-flow-direct.mjs
```

El E2E descuenta 1 unidad temporal y luego restaura stock.

## Backups relevantes

- Backup general inicial:
  - `CultiSoft_BACKUPS/CultiSoft_source_backup_20260622_024952.tar.gz`
- Backup inventario pre-conteo duro:
  - `CultiSoft_BACKUPS/inventory_before_hard_count_20260622_034524.json`
- Backups de env local antes de sync:
  - `CultiSoft_BACKUPS/env_cultisoft_*.bak`

## Hallazgos pendientes de data

Auditorías generadas:

```bash
node scripts/audit-users-db.mjs
node scripts/audit-compliance-db.mjs
node scripts/audit-missing-docs.mjs
node scripts/audit-no-valid-rx.mjs
node scripts/audit-prescription-urls.mjs
```

Pendientes detectados:

- pacientes con docs críticos faltantes.
- pacientes sin receta válida.
- una URL legacy inválida en `prescription_url`.

Archivos de salida:

- `scripts/out/patients-missing-docs.csv`
- `scripts/out/patients-no-valid-rx.csv`

## Reglas de operación

- No tocar credenciales existentes.
- No usar pacientes reales para E2E.
- Todo E2E productivo debe tener rollback.
- Todo ajuste de inventario debe dejar `inventory_movements` auditable.
- Antes de cambios destructivos: snapshot/backup.
