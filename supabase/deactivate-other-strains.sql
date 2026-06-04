-- Deja activos solo los productos permitidos para compra web.
-- Activos a la fecha:
--   - bourbon-street-lit-farms
--   - gaslight-purple-ghost-sativa-dominante-lit-farm
--   - aceite-sublingual-calma
-- Esta migración es idempotente.

UPDATE products
   SET is_active = 1,
       shopify_status = 'active'
 WHERE strain_key IN (
     'bourbon-street-lit-farms',
     'gaslight-purple-ghost-sativa-dominante-lit-farm',
     'aceite-sublingual-calma'
   );

UPDATE products
   SET is_active = 0,
       shopify_status = 'archived'
 WHERE strain_key IS NOT NULL
   AND strain_key NOT IN (
     'bourbon-street-lit-farms',
     'gaslight-purple-ghost-sativa-dominante-lit-farm',
     'aceite-sublingual-calma'
   );
