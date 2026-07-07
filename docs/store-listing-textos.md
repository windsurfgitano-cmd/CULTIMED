# Textos de ficha — App Store & Google Play (Cultimed)

> Copiar/pegar en App Store Connect y Google Play Console. Los conteos de
> caracteres están verificados contra los límites de cada campo.
> Tono: clínico, sobrio, cumplimiento normativo. Sin lenguaje recreativo.

---

## App Store (Apple)

### 1. Nombre de la app (máx 30)
- **Cultimed** (8) — el más limpio
- **Cultimed · Dispensario** (22) — recomendado
- **Cultimed Dispensario Médico** (27)

### 2. Subtítulo (máx 30)
- **Dispensario médico autorizado** (29) — recomendado
- **Cannabis medicinal con receta** (29)
- **Cannabis con respaldo clínico** (29)

### 3. Texto promocional (máx 170)
> Catálogo de cannabis medicinal validado por químico farmacéutico. Solo para pacientes con receta vigente. Despacho a todo Chile bajo Ley 20.850 y normativa SANNA.
(163)

### 4. Descripción
```
Cultimed es un dispensario médico autorizado en Chile, especializado en cannabis medicinal de grado farmacéutico.

Esta app está pensada para pacientes con receta médica vigente. El acceso al catálogo es restringido: primero creas tu cuenta y cargas tu receta e identificación, y un químico farmacéutico valida tus documentos en menos de 24 horas hábiles. Recién entonces se habilita el catálogo completo, con precios, disponibilidad real por lote y trazabilidad.

Qué puedes hacer desde la app:
• Cargar tu receta y documentos de forma segura
• Acceder al catálogo clínico una vez validado
• Consultar trazabilidad por lote y análisis de laboratorio (COA)
• Realizar tus pedidos y seguir su estado en tiempo real
• Recibir tu tratamiento con despacho a todo Chile o retiro

Operamos bajo la Ley 20.850, el D.S. Nº 345/2016 y la normativa SANNA, con productos con registro sanitario del ISP. El pago se realiza por transferencia bancaria y la dispensación siempre está supervisada por un profesional de la salud.

Cultimed no promueve el autodiagnóstico ni el uso sin supervisión médica. Consulta siempre a un profesional de salud habilitado.
```
(~1080)

### 5. Palabras clave (campo keywords, máx 100)
```
cannabis medicinal,dispensario,receta,CBD,THC,Ley 20.850,SANNA,salud,tratamiento,Chile
```
(85)

### 6. URLs
- **URL de soporte:** https://dispensariocultimed.cl
- **URL de marketing:** https://dispensariocultimed.cl
- **Email de soporte:** contacto@dispensariocultimed.cl

### 7. Notas para el revisor de Apple (App Review notes)
```
Cultimed es un dispensario de cannabis medicinal con autorización sanitaria en Chile (CULTIMED SPA), que opera bajo la Ley 20.850, el D.S. 345/2016 y la normativa SANNA, con productos con registro ISP. El acceso al catálogo requiere que el paciente suba una receta médica vigente, la cual es validada por un químico farmacéutico antes de habilitar cualquier compra. La app es un contenedor nativo del sitio dispensariocultimed.cl.

Para revisar el catálogo completo (visible solo tras la validación de receta), pueden usar esta cuenta demo con receta ya aprobada:
  Usuario: rincondeoz@gmail.com
  Contraseña: caca123

La app está destinada exclusivamente a usuarios en Chile; configuraremos la disponibilidad geográfica restringida a Chile en Pricing and Availability. El pago se realiza por transferencia bancaria, fuera del procesamiento in-app.
```

**Requisito Apple:** la cuenta de desarrollador debe ser de tipo **Organización** (no Individual) para apps de dispensario, y la app debe geo-restringirse a Chile.

---

## Google Play

### 8. Título (máx 30)
- **Cultimed · Dispensario** (22) — recomendado
- **Cultimed** (8)

### 9. Descripción corta (máx 80)
- **Dispensario médico de cannabis con receta. Despacho a todo Chile.** (63) — recomendado
- **Cannabis medicinal validado por químico farmacéutico.** (53)
- **Acceso a cannabis medicinal bajo receta médica vigente.** (55)

### 10. Descripción completa
```
Cultimed es un dispensario médico autorizado en Chile, especializado en cannabis medicinal de grado farmacéutico.

La app está destinada a pacientes con receta médica vigente. El acceso al catálogo es restringido: creas tu cuenta, cargas tu receta e identificación, y un químico farmacéutico valida tus documentos en menos de 24 horas hábiles antes de habilitar la compra.

Con Cultimed puedes:
• Cargar tu receta y documentos de forma segura
• Acceder al catálogo clínico una vez validado
• Consultar trazabilidad por lote y análisis de laboratorio (COA)
• Realizar pedidos y seguir su estado
• Recibir tu tratamiento con despacho a todo Chile o retiro

Operamos bajo la Ley 20.850, el D.S. Nº 345/2016 y la normativa SANNA, con productos con registro sanitario del ISP. La dispensación está siempre supervisada por un profesional de la salud.

Cultimed no promueve el autodiagnóstico ni el uso sin supervisión médica. Consulta siempre a un profesional de salud habilitado.
```
(~950)

### 11. Categoría y clasificación
- **Categoría sugerida:** Medicina (o Salud y bienestar).
- **Clasificación de contenido:** en el cuestionario de Play, declarar que la app hace **referencia a cannabis medicinal con licencia / sustancias controladas** bajo prescripción. No ocultar esto — declararlo honestamente ayuda a pasar la revisión y evita bajas posteriores.
- **Público objetivo:** mayores de 18, Chile.

### 12. ⚠️ Recordatorio de compliance para el equipo (NO es texto de ficha)
La versión que se suba a **Google Play NO debe permitir generar el pedido dentro de la app** — la política de Google prohíbe el carrito/checkout de cannabis en la app "regardless of legality". Ya está preparada la variante con **redirect al navegador** para el checkout, que se activa cuando el user agent trae `CultimedPlay` (ver `cultimed-store/app/checkout/CheckoutClient.tsx`). Compilar la build de Play con esa config antes de subir. La versión de App Store (Apple) y el APK directo sí llevan checkout completo dentro de la app.
