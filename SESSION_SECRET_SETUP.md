# Configuración de SESSION_SECRET para producción

## Problema
Actualmente ambos proyectos (cultimed-store y cultisoft) usan fallback dev para `SESSION_SECRET` cuando la variable de entorno no está configurada. Esto es inseguro para producción.

## Solución
Configurar variables de entorno `SESSION_SECRET` en ambos proyectos de Vercel.

## Pasos

### 1. Generar secret seguro
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'));"
```

Output ejemplo:
```
ecc9211af39068365d5fb7e2dcccea6bed03abd7e8c00f1c740aba11f66fc7ee350f2d375452fc8b74a8b6718a298380216647aab763740ba67cfad2890978ae
```

### 2. Configurar en Vercel

#### Proyecto: cultimed (store - dispensariocultimed.cl)
1. Ir a https://vercel.com/ [usuario]/cultimed/settings/environment-variables
2. Agregar variable:
   - Name: `SESSION_SECRET`
   - Value: [el secret generado]
   - Environment: Production (y Preview si deseas)

#### Proyecto: cultimed-wey3 (admin - panel.dispensariocultimed.cl)
1. Ir a https://vercel.com/ [usuario]/cultimed-wey3/settings/environment-variables
2. Agregar variable:
   - Name: `SESSION_SECRET`
   - Value: [puede ser el mismo o uno diferente]
   - Environment: Production (y Preview si deseas)

### 3. Redeploy
Después de configurar las variables, redeploy ambos proyectos:
```bash
cd cultimed-store
vercel deploy --prod --archive tgz

cd ../cultisoft
vercel deploy --prod --archive tgz
```

### 4. Verificar
- Los warnings en consola deberían desaparecer
- Las sesiones serán seguras
- No más mensajes "SESSION_SECRET no configurado"

## Notas
- El mismo `SESSION_SECRET` puede usarse en ambos proyectos para simplificar
- Si cambias el secret, todas las sesiones existentes serán inválidas (usuarios tendrán que login nuevamente)
- Mantén el secret en lugar seguro, no lo compartas ni lo subas a repositorios
