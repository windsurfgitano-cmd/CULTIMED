-- Deactiva las cepas que no están en el allow-list del storefront.
-- Activas a la fecha: bourbon-street-lit-farms, gaslight-purple-ghost-sativa-dominante-lit-farm
-- Esta migración es idempotente. Para reactivar una cepa:
--   UPDATE products SET is_active = 1, shopify_status = 'active'
--   WHERE strain_key = '<strain_key>';

UPDATE products
   SET is_active = 0,
       shopify_status = 'archived'
 WHERE strain_key IS NOT NULL
   AND strain_key NOT IN (
     'bourbon-street-lit-farms',
     'gaslight-purple-ghost-sativa-dominante-lit-farm'
   );
