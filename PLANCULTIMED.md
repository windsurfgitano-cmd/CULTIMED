# PLAN CULTIMED — Operación 2026

> Documento operacional para el equipo Cultimed.
> Cubre administrativo, ventas, comunicación (RRSS + WhatsApp + email), cultivo y rituales internos.
> **No incluye temas técnicos de plataforma / IT** (eso vive en doc separado del owner).
> Vivo: editar siempre que cambie una decisión.

**Versión:** 0.2
**Fecha:** 2026-04-28
**Estado:** Lista de trabajo activa
**Mantiene:** Oscar (owner) + cualquiera del equipo que trabaje un área

---

## 0. MAPA DE EQUIPO

Cuatro frentes. Una persona puede tomar más de uno al inicio, pero cada frente tiene **un dueño claro**.

| Frente | Dueño | Responsabilidad central | Herramientas core |
|---|---|---|---|
| **A. Administrativo** | QF / Recepción | Pacientes, recetas, datos limpios, compliance SANNA, bitácora | Cultisoft admin, Excel/CSV, archivo físico |
| **B. Ventas** | Mostrador + Web | Atender mostrador, despachar pedidos web, precios, promociones | Cultisoft mostrador, WhatsApp, caja |
| **C. RRSS + WhatsApp + Email** | Comunicación | Identidad, copy, newsletter, grilla IG, atención WSP | Instagram, plataforma newsletter, WSP Business |
| **D. Cultivo** | Cultivo | Producción, variedades, lotes, trazabilidad, stock entrante | Bitácora cultivo, fotos lote, COA |

Regla simple: **si no tiene dueño, no se hace.** Si dos personas creen que son dueñas de algo, escalar a Oscar y decidir en 24h.

> *La operación de plataforma (admin web, base de datos, hosting, integraciones) la lleva el owner directamente. Si el equipo necesita un cambio en el sistema, se levanta como ticket a Oscar — no es responsabilidad del frente que lo necesita resolverlo técnicamente.*

---

## A. ADMINISTRATIVO — Pacientes, recetas y compliance

### A.1 Limpieza de base de pacientes

**Problema actual:** importamos pacientes desde Shopify. Hay registros con datos parciales (sin RUT, sin teléfono, email autogenerado).

**Acción inmediata (semana 1):**

- [ ] Generar listado de pacientes activos con datos faltantes (RUT, teléfono, email real, fecha de nacimiento, comuna). Pedirle al owner que entregue el CSV.
- [ ] Campaña outbound de enriquecimiento: WhatsApp + email con enlace para que cada paciente complete sus datos.
- [ ] Después de 14 días, los que no respondieron → llamada telefónica del equipo de mostrador.
- [ ] Después de 30 días sin completar → marcar como "datos pendientes" y bloquear nuevas dispensaciones hasta regularizar.

**Copy WhatsApp (A.1):**
> "Hola, [nombre]. Soy [nombre QF] del equipo Cultimed 🌿
>
> Estamos actualizando la ficha clínica de todos nuestros pacientes para cumplir con la normativa SANNA. Te tomará 2 minutos.
>
> Por favor completa tus datos acá: dispensariocultimed.cl/cuenta/perfil
>
> Cualquier duda, respondes este mensaje. Cuídate."

**Copy email asunto (A.1):** `Acción requerida: completa tu ficha en Cultimed (2 min)`

### A.2 Validación de recetas — política y SLA

| Criterio | Decisión |
|---|---|
| Vigencia receta médica | 6 meses desde emisión, salvo que el médico indique menos. |
| Tiempo máximo de validación QF | 24h hábiles desde la subida. |
| Documentos aceptados | PDF, JPG, PNG, WEBP. Máx 10 MB. |
| Calidad mínima | Legible, con timbre/firma médico, RUT paciente, fecha. |
| Receta rechazada — ¿paciente puede resubir? | Sí, sin límite. Cada intento queda en bitácora. |
| Receta vencida | Notificación 30 días antes + bloqueo automático al día 0. |
| Almacenamiento | 5 años, luego archivo offline (lo gestiona el owner). |

**Checklist QF al validar (A.2):**
- [ ] Nombre del paciente coincide con la cuenta (no apodo, no familiar).
- [ ] RUT en receta = RUT en cuenta.
- [ ] Fecha de emisión visible y < 6 meses.
- [ ] Producto recetado existe en catálogo o es genérico ("aceite CBD 10%", "flor sativa").
- [ ] Firma + timbre médico legibles.
- [ ] Médico tiene RUT y especialidad (idealmente prescriptor habitual).

**Si falta cualquiera → rechazar con nota específica.**

**Copy nota de rechazo — plantillas (A.2):**

> **R1 (calidad de imagen):** "Receta no legible. Por favor súbela nuevamente con buena luz, sin sombras y que se vean claramente: tu nombre, tu RUT, la firma y el timbre del médico. Si la tienes en PDF original, mejor."

> **R2 (datos no coinciden):** "El nombre/RUT de la receta no coincide con los datos de tu cuenta. Verifica que estás subiendo tu propia receta y que tus datos estén actualizados en /cuenta/perfil."

> **R3 (vencida):** "La receta tiene más de 6 meses desde su emisión. Necesitamos una receta vigente. Si no puedes ver a tu médico habitual, te podemos derivar a una consulta online en /consulta."

> **R4 (producto no aplica):** "El producto que indica tu receta no corresponde a los que dispensamos en Cultimed. Te sugerimos consultar con tu médico una alternativa equivalente o agendar una consulta con nuestro equipo."

### A.3 Bitácora SANNA / ISP

Cada dispensación (mostrador o web) debe quedar registrada con:

- ID dispensación (único)
- Paciente (nombre + RUT)
- Producto (SKU + lote + cantidad)
- Receta asociada (médico + fecha emisión)
- QF responsable
- Fecha y hora
- Canal (mostrador / web / despacho)

Lo que se requiere del flujo administrativo:
- [ ] Llenar campo "observaciones" (efectos adversos, cambios de dosis, etc.) cuando el paciente comente algo en mostrador o WhatsApp.
- [ ] Reporte trimestral imprimible (PDF) listo para presentar al ISP si hay fiscalización — coordinar con owner el día 1 de cada trimestre.

### A.4 Datos faltantes — ¿qué pedirle a quién?

| A quién | Qué pedirle | Cuándo | Cómo |
|---|---|---|---|
| Pacientes activos sin RUT | RUT + fecha nacimiento | Semana 1 | WhatsApp masivo + link a perfil |
| Pacientes sin teléfono | Teléfono + comuna | Semana 1 | Email |
| Médicos prescriptores frecuentes | Datos formales (RUT, especialidad, registro) | Semana 2 | Llamada de QF |
| Cultivo | Lista actualizada de variedades en producción + COA por lote | Semana 1 | Reunión presencial |
| Contador | Formato exacto que necesita para libro de ventas mensual | Semana 1 | Email |
| Abogado | Revisión TyC + política de privacidad | Semana 2 | Reunión |

---

## B. VENTAS — Precios, catálogo, mostrador y pedidos web

### B.1 Análisis de precios (pendiente prioritario)

**Problema actual:** los precios vienen de la migración Shopify y no se han revisado vs. costo real ni vs. competencia.

**Acción (semana 1):**

- [ ] Para cada SKU activo, llenar tabla:

| SKU | Costo unitario (cultivo o proveedor) | Margen objetivo | PVP propuesto | Competencia A | Competencia B | PVP final |
|---|---|---|---|---|---|---|

Competencia a monitorear:
- Knop (knop.cl)
- Mamacanna (mamacanna.cl)
- Otros dispensarios con receta SANNA

**Regla de margen sugerida:**
- Productos propios (cultivo Cultimed): margen 60-70% sobre costo cargado.
- Productos de terceros (aceites, cápsulas comprados): margen 35-45%.
- Producto "ancla" (uno por categoría más accesible): margen 25-30% para captar pacientes nuevos.

### B.2 Catálogo — política

| Decisión | Valor |
|---|---|
| ¿Mostrar precio sin login? | NO. Solo tras login + age gate aceptado. |
| ¿Mostrar stock exacto? | NO. Solo "disponible" / "stock limitado" / "agotado". |
| Producto sin stock | Visible con badge "agotado", sin botón comprar. Permite "avísame cuando llegue". |
| Producto nuevo | Badge "nuevo" 30 días desde alta. |
| Producto en oferta | Badge "ajuste de precio" — NUNCA "oferta" o "descuento". (tono médico, no retail). |
| Variedades de flor | Mostrar perfil terpénico + ratio CBD/THC + aroma dominante. NO mood/efecto recreativo. |

### B.3 Pedidos web — flujo y SLA

| Etapa | SLA | Quién |
|---|---|---|
| Comprobante recibido → pago verificado | 4h hábiles | QF/admin |
| Pago verificado → preparado | 24h hábiles | Mostrador |
| Preparado → listo para retiro / despachado | mismo día | Mostrador |
| Despacho a domicilio | 48-72h dentro RM, 5 días regiones | Courier (Starken/Chilexpress) |

**Política de cancelación:**
- Antes de "pagado": cancelación libre por paciente, comprobante se devuelve.
- Después de "pagado": solo Cultimed cancela (stock, error). Devolución dentro de 5 días hábiles.
- "Listo para retiro" sin retiro en 7 días: contactar paciente. Después de 14 días: reposición a stock + reembolso menos 10% gestión.

### B.4 Mostrador — caja chica y conciliación

- [ ] Definir caja chica diaria: $50.000 inicial.
- [ ] Cierre diario a las 19:00: cuadrar caja vs. dispensaciones del día.
- [ ] Diferencia > $5.000 → escalar a Oscar mismo día.
- [ ] Reporte mensual de ventas: mostrador + web consolidado, desglosado por categoría + producto top 10.

---

## C. RRSS + WHATSAPP + EMAIL — Comunicación con pacientes

### C.1 Identidad de marca — versión liviana

> **No es un manual de marca de 80 páginas. Son 6 reglas que cualquier persona del equipo puede aplicar mañana.**

1. **Tono:** Cálido pero profesional. Hablamos de salud, no de fiesta. Tutear OK, pero sin chistes recreativos.
2. **Lenguaje:** "Paciente" (nunca "cliente" en posts de salud / "cliente" sí en posts internos de operación). "Producto" o "preparado" (nunca "merca", "weed", "marihuana"). "Cannabis medicinal" en formal, "cannabis" en informal.
3. **Visual:**
   - Paleta: navy `#0A1628`, verde bosque `#1A3A2F`, dorado `#C9A96E`, hueso `#F5F2EC`.
   - Tipografía display: Playfair / Tiempos. UI: Geist / Inter. Mono para datos.
   - Fotos: luz natural, fondo blanco hueso o navy, NUNCA hojas verdes saturadas tipo grow shop.
4. **Lo que NUNCA hacemos:**
   - Emojis de hojas, humo, fuego.
   - Memes recreativos.
   - "420" en ningún lado.
   - Comparar con drogas duras ("alternativa natural a los opioides" SÍ — "no es como otras drogas" NO).
   - Promesas médicas ("cura el cáncer") — solo claims respaldados por estudio + cita.
5. **Lo que SIEMPRE hacemos:**
   - Disclaimer de receta médica visible.
   - Citar estudio cuando hablemos de uso terapéutico.
   - Linkear a `/consulta` cuando alguien pregunte si su condición aplica.
   - Responder en menos de 4h hábiles.
6. **Firma de WhatsApp/email:** "Equipo Cultimed · dispensariocultimed.cl" — nunca firma personal salvo en consultas clínicas.

### C.2 Copys WhatsApp — biblioteca de plantillas

Plantillas listas. Cuando se editen, registrar versión y fecha.

**C.2.1 — Bienvenida nuevo paciente registrado**
> "Hola [nombre], te damos la bienvenida a Cultimed 🌿
>
> Tu cuenta ya está activa. Para poder dispensar productos necesitamos:
>
> 1. Que subas tu receta médica vigente en dispensariocultimed.cl/cuenta/recetas
> 2. Que un QF la valide (24h hábiles)
>
> Después puedes comprar libremente. Cualquier duda, respondes acá."

**C.2.2 — Receta aprobada**
> "[nombre], tu receta fue aprobada ✓
>
> Ya puedes ver precios y comprar en dispensariocultimed.cl. Tu receta queda registrada por 6 meses.
>
> Equipo Cultimed"

**C.2.3 — Receta rechazada**
> "[nombre], revisamos tu receta y necesitamos que la subas de nuevo:
>
> *[motivo específico — ver plantillas R1/R2/R3/R4 en sección A.2]*
>
> Súbela en dispensariocultimed.cl/cuenta/recetas. Cualquier duda respondes acá."

**C.2.4 — Comprobante recibido (auto)**
> "[nombre], recibimos tu comprobante del pedido [folio]. Lo verificamos en máximo 4h hábiles y te avisamos cuando esté listo."

**C.2.5 — Pago confirmado**
> "[nombre], confirmamos tu pago del pedido [folio] ✓
>
> Estamos preparando tu retiro. Te avisamos cuando esté listo (24h hábiles)."

**C.2.6 — Listo para retiro**
> "[nombre], tu pedido [folio] está listo para retiro 📦
>
> Dirección: [dirección]
> Horario: lun-vie 10:00-19:00, sáb 10:00-14:00
> Trae tu cédula.
>
> Si necesitas otro horario, respondes este mensaje."

**C.2.7 — Despachado**
> "[nombre], tu pedido [folio] fue despachado por [courier] con seguimiento [tracking]. Llega en [días] días hábiles.
>
> Tracking: [link]"

**C.2.8 — Recordatorio receta por vencer (30 días antes)**
> "[nombre], tu receta vigente en Cultimed vence el [fecha]. Para no quedarte sin tu medicación, agenda con tu médico habitual o reserva una consulta online en dispensariocultimed.cl/consulta.
>
> Avísanos cualquier cosa."

**C.2.9 — Reactivación (paciente sin compras 90 días)**
> "[nombre], hace [N] meses que no nos vemos. Si dejaste tu tratamiento por algo que podamos mejorar (precio, atención, tiempo de despacho), nos gustaría escucharte.
>
> Y si simplemente no necesitabas más medicación, todo bien — acá estamos cuando quieras. Equipo Cultimed."

**C.2.10 — Pedido cancelado / reembolso**
> "[nombre], cancelamos el pedido [folio] por [motivo]. Te devolvemos $[monto] a la cuenta desde la que pagaste, en máximo 5 días hábiles. Cualquier duda respondes acá."

### C.3 Newsletter — frecuencia y estructura

**Frecuencia:** mensual. Día 5 de cada mes. Hora: martes 10:00.

**Estructura de cada edición (~5 secciones, ~800 palabras):**

1. **Editorial breve (200 palabras):** firmada por QF o por Oscar. Tema clínico o regulatorio del mes.
2. **Producto destacado:** uno solo. Foto editorial + perfil terpénico + indicación principal + cita de estudio.
3. **Educación:** un mito desmentido o un dato útil ("¿Diferencia entre full spectrum y broad spectrum?").
4. **Notas del cultivo:** 2-3 fotos del invernadero, cosecha, lote nuevo. Sin caras del equipo si no quieren.
5. **Próximo:** charla, evento, producto entrante.

**Disclaimer fijo al pie:**
> "Cultimed es un dispensario autorizado bajo normativa SANNA. Todo producto requiere receta médica vigente. Esta newsletter no constituye consejo médico. Si tienes dudas sobre tu tratamiento, consulta a tu médico tratante o agenda una consulta en dispensariocultimed.cl/consulta."

**Asuntos sugeridos por mes (12 ejemplos para tener stock):**

1. "Lo que aprendimos en nuestro primer año dispensando"
2. "CBD vs CBN: ¿en qué se diferencian para dormir?"
3. "Por qué pedimos receta médica (y no es solo por la ley)"
4. "Cosecha de otoño: lote 2026-04 ya disponible"
5. "Cinco preguntas que recibimos cada semana"
6. "Cómo conversar con tu médico sobre cannabis medicinal"
7. "El proceso desde la planta hasta tu frasco"
8. "Mitos sobre dosificación que escuchamos en mostrador"
9. "Una guía para pacientes nuevos"
10. "Qué cambia con la nueva normativa SANNA"
11. "Aceites full spectrum: por qué la matriz importa"
12. "Cierre de año: lo que viene en 2027"

### C.4 Instagram — grilla y pilares

**Frecuencia:** 3 posts/semana (lun, mié, vie 18:30) + 1-2 stories diarias.

**Pilares (30% / 30% / 25% / 15%):**

| Pilar | % | Qué postear | Ejemplo |
|---|---|---|---|
| Educación | 30% | Carruseles divulgativos, mitos vs. realidad, glosario | "Endocannabinoide en 4 slides", "¿Qué es un terpeno?" |
| Producto | 30% | Foto editorial de producto, perfil, lote, COA disponible | Aceite CBD 10% sobre fondo navy, dorado, mate |
| Comunidad | 25% | Testimonios (anónimos o con consentimiento), respuestas a DMs frecuentes | "Una paciente nos preguntó X. Esto le respondió la QF." |
| Detrás de cámara | 15% | Cultivo, equipo, proceso, eventos | Foto de cosecha, manos del equipo, sin caras si no quieren |

**Reglas de imagen:**
- Siempre con la paleta. Fondo navy o hueso. Acentos dorados sutiles.
- Tipografía Playfair en títulos, Geist en cuerpo.
- Cero emojis decorativos en captions. Máximo 1-2 funcionales (✓, →).
- Si hay producto en cuadro, va con disclaimer "Producto requiere receta médica" en discreto.

**Ejemplo de grilla mensual (12 posts):**

```
Sem 1: edu carrusel | producto destacado | testimonio
Sem 2: edu reel breve | proceso cultivo | producto secundario
Sem 3: edu carrusel | comunidad (Q&A) | producto destacado nuevo
Sem 4: edu mito vs realidad | cultivo cosecha | resumen del mes
```

**Stories diarias — ideas:**
- Encuesta: "¿Conocías la diferencia entre full y broad spectrum?"
- Detrás de cámara: armado de pedido web (sin mostrar paciente).
- Pregunta abierta: "¿Sobre qué les gustaría que hablemos esta semana?"
- Compartir el último newsletter.
- Mostrar nuevo lote en mostrador.

**Highlights destacados (siempre fijos en el perfil):**
1. Cómo registrarme (paso a paso)
2. Sobre la receta
3. Productos
4. Cultivo
5. Preguntas frecuentes
6. Charlas/Eventos

### C.5 WhatsApp Business — configuración

- [ ] Cuenta verificada de WhatsApp Business.
- [ ] Mensaje de bienvenida automático:
  > "Hola, somos Cultimed 🌿. Atendemos lun-vie 10:00-19:00 y sáb 10:00-14:00. Si nos escribes fuera de horario, te respondemos al siguiente día hábil. Para urgencias clínicas, contacta a tu médico tratante o llama al 131."
- [ ] Mensaje de ausencia (fuera de horario): mismo de arriba.
- [ ] Etiquetas de chat: 🟢 receta-pendiente · 🟡 pago-pendiente · 🔵 pedido-en-curso · ⚪ general · 🔴 reclamo.
- [ ] Catálogo en WhatsApp: NO (precios sin login es contrario a la política).
- [ ] Lista de difusión: solo para pacientes que aceptaron explícitamente al registrarse.

---

## D. CULTIVO — Producción y trazabilidad

### D.1 Información que necesitamos del área de cultivo

- [ ] Lista de variedades en producción actual (genética, ratio CBD/THC, terpenos dominantes).
- [ ] Calendario estimado de cosecha próximas (12 meses).
- [ ] COA (Certificado de Análisis) por lote — laboratorio que se usa.
- [ ] Costo de producción por gramo (luz, sustrato, mano de obra, amortización).
- [ ] Capacidad mensual: gramos/mes terminados listos para dispensar.
- [ ] Política de pérdida/merma esperada.

### D.2 Sistema de lotes

| Campo | Formato |
|---|---|
| ID lote | `CM-[YYYY]-[MM]-[var]-[seq]` (ej: `CM-2026-04-CB1-001`) |
| Variedad | Nombre interno (ej: `CB1`, `CB2`, `OG-MED`) |
| Fecha cosecha | YYYY-MM-DD |
| Fecha curado fin | YYYY-MM-DD |
| Peso final seco (g) | numérico |
| Análisis lab | Link al PDF del COA |
| Estado | producción / curado / análisis / disponible / agotado |
| Productos derivados | SKU(s) que salen de este lote |

Cultivo entrega esta info en planilla compartida (Sheets) cada vez que se mueve un lote de etapa.

### D.3 Trazabilidad lote → paciente

Por compliance SANNA queremos poder responder en <5 minutos:

> *"Si el lote CM-2026-04-CB1-001 tuviera un problema, ¿a qué pacientes le dispensamos producto de ese lote?"*

Lo que requiere el área:
- Cada producto preparado (frasco, blíster, bolsa) sale del mostrador con su lote claramente identificado en la etiqueta.
- En mostrador, al dispensar, anotar el lote en la dispensación. Si hay duda, preguntar antes — NUNCA adivinar.
- Si llega una alerta de lote retirado, cultivo notifica a Oscar y el QF inicia contacto a pacientes afectados (ver O.1).

### D.4 Costos y P&L cultivo

Plantilla mensual a llenar por cultivo (Excel/Sheets):

| Mes | Gramos cosechados | Gramos disponibles (post-curado) | Costo total mes | Costo/g | Variedad principal |
|---|---|---|---|---|---|

Reunión mensual de 30 min: cultivo presenta, ventas revisa rotación por variedad, ajustamos foco productivo.

---

## E. RITUALES Y CADENCIA

### E.1 Reuniones fijas

| Reunión | Cadencia | Duración | Asistentes | Output |
|---|---|---|---|---|
| Stand-up operación | Diario 09:30 | 15 min | QF + mostrador | Pendientes del día, recetas pendientes, despachos |
| Comité semanal | Lunes 10:00 | 60 min | Oscar + 1 por frente | Métricas semana anterior, decisiones, foco semana |
| Cultivo + ventas | Mes último viernes | 30 min | Cultivo + Oscar | Producción vs. demanda, ajustes |
| RRSS + comunicación | Mes 1er viernes | 45 min | Comunicación + QF | Grilla del mes + newsletter |
| Revisión financiera | Mes día 5 | 60 min | Oscar + contador | Cierre mes anterior, márgenes, ajustes precios |

### E.2 KPIs por frente — qué medir

**A. Administrativo**
- Recetas validadas dentro de SLA 24h (objetivo > 95%)
- Pacientes con datos completos (objetivo > 90% en 60 días)
- Auditorías pendientes (objetivo: 0)

**B. Ventas**
- Ventas mensuales totales (mostrador + web)
- Ticket promedio
- Tasa de conversión web (visitas → compra)
- % ventas web vs. mostrador
- Pedidos web en SLA de despacho (objetivo > 90%)

**C. RRSS + WhatsApp + Email**
- Followers Instagram (crecimiento mensual)
- Engagement rate (objetivo > 3%)
- Suscriptores newsletter
- Open rate newsletter (objetivo > 35%)
- Tiempo respuesta WhatsApp promedio (objetivo < 2h hábiles)

**D. Cultivo**
- Gramos cosechados/mes
- Costo/g
- Tasa de aprobación de lotes en lab (objetivo 100%)
- Cobertura de stock (semanas de inventario)

Reporte mensual consolidado lo arma Oscar el día 5 y se revisa en Comité semanal siguiente.

---

## F. ROADMAP — 12 SEMANAS (vista equipo)

### Semanas 1-2 — Datos limpios y precios definidos
- [ ] Campaña enriquecimiento de datos pacientes (A.1)
- [ ] Análisis de precios + nueva tabla de PVP (B.1)
- [ ] Plantillas WhatsApp cargadas y aprobadas
- [ ] Identidad de marca lite revisada por todo el equipo (C.1)

### Semanas 3-4 — Lanzamiento soft
- [ ] Newsletter 1 (anuncio "estamos en línea")
- [ ] Anuncio en IG con grilla cargada del mes
- [ ] Email a pacientes activos: "ahora pueden comprar online"
- [ ] Soporte WhatsApp con plantillas activas
- [ ] Cultivo entrega catálogo formal de variedades + COA disponibles

### Semanas 5-8 — Iteración y crecimiento
- [ ] 2 newsletters más
- [ ] Primera charla online "Cannabis medicinal: lo que tu médico debería saber"
- [ ] Primer reporte mensual de KPIs
- [ ] Onboarding doc para nuevo miembro de equipo (Notion o equivalente)
- [ ] Comité con abogado: revisión TyC, política privacidad, normativa publicidad

### Semanas 9-12 — Consolidación
- [ ] Revisión de precios mes 3 (B.1 actualizado con datos reales)
- [ ] Programa de pacientes ejemplo / embajadores (consentimientos firmados)
- [ ] Primer ciclo completo de funnel WhatsApp evaluado (ver I)
- [ ] Onboarding documentado para sumar 1-2 personas al equipo
- [ ] Auditoría interna: ¿estamos cumpliendo el manual o derivando?

---

## G. DECISIONES ABIERTAS — REGISTRO

> Cada vez que aparece una decisión que no es obvia, anotarla acá con fecha y resolución.

| Fecha | Decisión | Opciones | Decidido | Razón |
|---|---|---|---|---|
| 2026-04-28 | Pago automatizado web | Manual transferencia / Webpay / Khipu | Manual fase 1 | Validar volumen primero (umbral: 100 pedidos web) |
| 2026-04-28 | Tono RRSS | "amistoso casual" / "editorial médico" | Editorial médico | Coherente con propuesta de valor |
| 2026-04-28 | Catálogo público | Precios visibles / ocultos | Ocultos hasta login | Compliance + posicionamiento |
| 2026-04-28 | Frecuencia newsletter | Quincenal / Mensual | Mensual | Calidad sobre cantidad |
| | | | | |

---

## H. DUDAS PARA RESOLVER ANTES DE LANZAR

Si no sabes a quién preguntarle, pregunta acá y se asigna.

- [ ] ¿Qué dice exactamente el ISP sobre publicidad de cannabis medicinal en redes? — Abogado.
- [ ] ¿Podemos enviar a regiones con courier estándar o necesitamos operador autorizado? — Abogado + cultivo.
- [ ] ¿Cuál es el volumen máximo dispensable por receta y por mes? — QF.
- [ ] ¿Existe un formato oficial del libro de dispensaciones SANNA? — QF + ISP.
- [ ] ¿Aceptamos receta de médico extranjero (paciente turista médico)? — QF.
- [ ] ¿Cómo manejamos pacientes menores con receta pediátrica (epilepsia)? — QF + abogado.
- [ ] ¿Política de muestras / regalos al equipo o a médicos prescriptores? — QF + abogado.

---

## I. FUNNELS WHATSAPP — Secuencias automáticas

> WhatsApp es nuestro canal #1 de retención. Cada funnel tiene un disparador (evento), una secuencia de mensajes y un objetivo medible.
> La automatización la habilita el owner desde el panel; el equipo de Comunicación se encarga del contenido y el seguimiento manual cuando el paciente responde.

### I.1 Funnel de **adquisición** (paciente nuevo registrado, sin receta)

**Disparador:** paciente se registra y no sube receta.
**Objetivo:** que suba la receta dentro de 7 días.
**KPI:** % cuentas creadas → receta subida.

| # | Cuándo | Mensaje |
|---|---|---|
| 1 | +24h post-registro | "Hola [nombre], te diste de alta en Cultimed pero aún no subes tu receta. Para empezar a comprar necesitamos validarla. Si necesitas una consulta médica para obtenerla, te ayudamos: dispensariocultimed.cl/consulta" |
| 2 | +72h | "[nombre], si ya tienes tu receta, súbela acá: dispensariocultimed.cl/cuenta/recetas. Toma 2 min y la validamos en 24h hábiles." |
| 3 | +7d (si sigue sin receta) | "[nombre], notamos que no has podido subir tu receta. ¿Hay algo en lo que podamos ayudarte? Respondes este mensaje y un QF te orienta. Si prefieres una consulta médica online, agendas en dispensariocultimed.cl/consulta — atendemos por TeleMed." |
| 4 | +21d (corte) | "[nombre], dejamos tu cuenta abierta pero pausamos los recordatorios. Cuando quieras retomar, súbenos tu receta y volvemos a estar disponibles. Cuídate." |

**Salida del funnel:** receta subida → entra a I.2 (validación).

---

### I.2 Funnel de **validación de receta** (post-upload)

**Disparador:** paciente sube receta y queda pendiente de revisión QF.
**Objetivo:** mantener al paciente informado y reducir incertidumbre.
**KPI:** tiempo promedio paciente→primera compra desde upload.

| # | Cuándo | Mensaje |
|---|---|---|
| 1 | Inmediato (auto) | "[nombre], recibimos tu receta ✓ Un QF la revisa y te avisamos en máximo 24h hábiles." |
| 2 | Validación = aprobada | (plantilla C.2.2) |
| 3 | Validación = rechazada | (plantilla C.2.3 con motivo R1/R2/R3/R4) |
| 4 | Aprobada +24h sin compra | "[nombre], ya puedes comprar en dispensariocultimed.cl. Si tienes dudas sobre qué producto se ajusta a tu indicación, escribenos acá y te orientamos." |
| 5 | Aprobada +7d sin compra | "[nombre], ¿hay algo que te frene para comprar? ¿Precio, despacho, dudas sobre el producto? Respondes acá y vemos. Sin presión." |

---

### I.3 Funnel de **carrito abandonado**

**Disparador:** carrito con productos por > 6h sin checkout completo.
**Objetivo:** recuperar venta.
**KPI:** % carritos recuperados.

| # | Cuándo | Mensaje |
|---|---|---|
| 1 | +6h | "[nombre], dejaste [producto] en tu carrito. ¿Quieres terminar la compra? dispensariocultimed.cl/checkout" |
| 2 | +48h | "[nombre], el stock de [producto] es limitado este mes. Si lo necesitas para tu tratamiento, te lo reservamos hasta fin de semana respondiendo este mensaje." |
| 3 | +7d | (no enviar — invasivo) |

**Importante:** evitar tono de venta agresiva. Tratamos pacientes, no carritos.

---

### I.4 Funnel de **comprobante no subido**

**Disparador:** pedido web esperando comprobante de transferencia por más de 24h.
**Objetivo:** completar pago o liberar stock.
**KPI:** % órdenes que cierran ciclo (paid o cancelled).

| # | Cuándo | Mensaje |
|---|---|---|
| 1 | +24h | "[nombre], tu pedido [folio] está esperando comprobante de transferencia. Datos bancarios: dispensariocultimed.cl/checkout. Si tuviste un problema con la transferencia, respondes acá." |
| 2 | +72h | "[nombre], si necesitas más tiempo para hacer la transferencia, dinos. Si prefieres cancelar el pedido y comprar después, también está bien. El stock lo liberamos a las 96h." |
| 3 | +96h | (auto) "Liberamos el stock del pedido [folio]. Cuando quieras retomar la compra, está disponible en dispensariocultimed.cl." |

---

### I.5 Funnel de **post-venta** (primer pedido entregado)

**Disparador:** primer pedido del paciente marcado como entregado.
**Objetivo:** feedback temprano + retención.
**KPI:** % primeros pedidos con segundo pedido en 60d.

| # | Cuándo | Mensaje |
|---|---|---|
| 1 | +48h post-entrega | "[nombre], ¿llegó todo bien con tu primer pedido? Cualquier observación nos ayuda a mejorar. Respondes acá." |
| 2 | +7d | "[nombre], si quieres saber cómo dosificar [producto] o resolver dudas de uso, agenda 15 min con nuestra QF en dispensariocultimed.cl/consulta — sin costo para pacientes nuevos." |
| 3 | +30d | "[nombre], cumpliste un mes con Cultimed 🌿 ¿Cómo va tu tratamiento? Si necesitas reposición, ya tienes tu receta validada hasta [fecha]." |

---

### I.6 Funnel de **reposición / receta por vencer**

**Disparador 1:** receta vence en 30 días.
**Disparador 2:** paciente sin compras en 60 días.

| # | Cuándo | Mensaje |
|---|---|---|
| 1 | Receta -30d | (plantilla C.2.8) |
| 2 | Receta -7d | "[nombre], tu receta vence el [fecha]. Si ya tienes una nueva, súbela en dispensariocultimed.cl/cuenta/recetas." |
| 3 | Inactividad +60d | (plantilla C.2.9 — reactivación) |
| 4 | Receta vencida 0d | "[nombre], tu receta venció hoy. Pausamos las dispensaciones hasta que subas una nueva. Si necesitas consulta, agendas en dispensariocultimed.cl/consulta." |

---

### I.7 Funnel de **win-back** (paciente que se fue)

**Disparador:** sin compras > 120 días + receta aún vigente o caducada.
**Objetivo:** recuperar o cerrar con dignidad.
**KPI:** % reactivados a 30d.

| # | Cuándo | Mensaje |
|---|---|---|
| 1 | +120d sin compra | "[nombre], hace 4 meses que no nos vemos. Sin presión: si dejaste tu tratamiento por algo que podamos mejorar, nos gustaría escucharte (5 min, respondes acá)." |
| 2 | +14d del anterior | "[nombre], si simplemente no necesitas más medicación, todo bien. Acá estaremos. Si quieres dejar de recibir mensajes nuestros, respondes BAJA y listo." |

**Reglas WhatsApp en general:**
- Nunca más de 2 mensajes seguidos sin respuesta del paciente.
- Respetar siempre BAJA / STOP / NO MOLESTAR.
- Cero emojis decorativos. Máximo 1 funcional (✓, →, 🌿) por mensaje.
- Firmar como "Equipo Cultimed" salvo en respuestas clínicas individuales.

---

## J. FUNNELS EMAIL — Secuencias automatizadas

> Email transaccional + nurturing. Tono más editorial que WhatsApp.
> El equipo de Comunicación escribe los textos; la activación técnica la coordina con el owner.

### J.1 Welcome series (post-registro, antes de comprar)

**Disparador:** registro nuevo en el sitio público.
**Objetivo:** educar + generar confianza + bajar fricción de subir receta.
**Cadencia:** 4 emails en 14 días.

| # | Día | Asunto | Contenido (pull) |
|---|---|---|---|
| 1 | 0 | Bienvenida a Cultimed | Quiénes somos, qué dispensamos, cómo funciona el proceso (3 pasos) |
| 2 | +2 | Tu receta y por qué la pedimos | Norma SANNA, qué documentos sirven, FAQ recetas, link consulta |
| 3 | +5 | Cómo elegir tu producto (con receta en mano) | Diferencias formato (aceite/cápsula/flor), perfil terpénico, cita estudio |
| 4 | +10 | Detrás de Cultimed: el cultivo | Foto invernadero, lote, COA disponible, "lo que NO hacemos" |

**Nota:** si el paciente sube receta antes del email 4, omitir email 4 y enviar uno final "ya tienes tu receta validada — empieza acá" + link al catálogo.

---

### J.2 Onboarding clínico (post-receta-aprobada)

**Disparador:** receta aprobada por QF.
**Objetivo:** conversión a primera compra + uso responsable.

| # | Día | Asunto | Contenido |
|---|---|---|---|
| 1 | 0 | Tu receta fue aprobada — algunos pasos antes de comprar | Lista de productos sugeridos según indicación común (ansiedad, sueño, dolor crónico, epilepsia). Disclaimer: orientación, no prescripción. |
| 2 | +3 | Dosificación 101 | Microdosis vs. dosis terapéutica, escalonamiento, registro de bitácora personal sugerido |
| 3 | +7 | Si tienes dudas sobre tu producto | Invitación a consulta gratis 15 min con QF para pacientes nuevos |

---

### J.3 Newsletter mensual

(Estructura definida en C.3 — agregar acá la lista de segmentación.)

**Segmentación recomendada:**
- Pacientes activos (compra últimos 90d)
- Pacientes en riesgo (sin compra 90-180d)
- Inactivos (>180d)
- Lista general (incluye no-pacientes que se registraron al newsletter)

Cada segmento puede recibir el mismo cuerpo pero con CTA distinto:
- Activos → producto destacado / nueva variedad
- En riesgo → "te extrañamos" suave + receta vigente?
- Inactivos → solo si cambia algo importante (ley, productos nuevos), no spam
- Lista general → contenido educativo, sin push de venta

---

### J.4 Educación serie larga ("Curso paciente Cultimed", opt-in)

**Disparador:** suscripción explícita en `/cuenta/curso` o desde footer.
**Objetivo:** lealtad, posicionamiento, autoridad clínica.
**Cadencia:** 8 emails, 1 por semana.

| # | Tema |
|---|---|
| 1 | Sistema endocannabinoide explicado simple |
| 2 | Diferencias entre CBD, THC, CBN, CBG |
| 3 | Full spectrum vs broad spectrum vs aislado |
| 4 | Vías de administración (oral, sublingual, inhalada) |
| 5 | Cómo conversar con tu médico |
| 6 | Mitos comunes (5 que se repiten en mostrador) |
| 7 | Tu bitácora personal (plantilla descargable) |
| 8 | Comunidad: cómo participar respetando privacidad |

Cada email: ~600 palabras, una imagen editorial, una cita de estudio, CTA suave a producto relacionado.

---

### J.5 Reposición sugerida (transaccional)

**Disparador:** consumo estimado del paciente cerca de agotar el frasco.
**Objetivo:** anticipar reposición.

> Email simple: "[nombre], según tu tratamiento de [producto], probablemente estás cerca de terminar el frasco. Si quieres, dejamos uno reservado y lo despachamos esta semana. Confirma con un click."

**Implementación:** inicialmente manual (revisión semanal por mostrador con la planilla de pacientes activos), automatizar en fase 2.

---

### J.6 Recuperación de pago (carrito web abandonado)

**Disparador:** checkout iniciado, sin completar transferencia.

| # | Día | Asunto |
|---|---|---|
| 1 | +1d | "Tu pedido [folio] está pendiente de pago" |
| 2 | +3d | "¿Necesitas ayuda con tu pedido?" |
| 3 | +5d | "Liberamos el stock de [producto] mañana" |

---

### J.7 Anti-funnel: cuándo NO enviar

- Domingo o feriado.
- Después de 22:00 o antes de 09:00.
- Más de 1 email por día al mismo paciente (salvo transaccional crítico).
- Si el paciente abrió ticket de reclamo activo.
- Si marcó "no recibir comunicación comercial" (siempre transaccional sí).

---

## K. Q&A PACIENTES — Master FAQ

> Preguntas reales que llegan por WhatsApp / mostrador / formularios. Cada una con respuesta consensuada para que cualquier persona del equipo conteste igual.
> **Convención:** las respuestas son entre comillas, listas para copy-paste con `[campos]` para personalizar.

### K.1 Sobre el dispensario y operación

**¿Necesito receta médica para comprar?**
> "Sí. Cultimed es un dispensario regulado bajo SANNA, y todos los productos que dispensamos requieren receta médica vigente (máximo 6 meses desde emisión). Si no tienes una, podemos derivarte a una consulta online en dispensariocultimed.cl/consulta."

**¿Cualquier médico me puede dar la receta?**
> "Cualquier médico habilitado en Chile puede prescribir cannabis medicinal con la receta correspondiente. No es exclusivo de una especialidad, aunque comúnmente la dan psiquiatras, neurólogos, oncólogos, médicos generales y de medicina del dolor."

**¿Cuánto demora validar mi receta?**
> "Máximo 24 horas hábiles desde que la subes. Recibirás un mensaje cuando esté lista."

**¿Puedo comprar para otra persona (ej. mi madre)?**
> "Solo si la cuenta y la receta están a nombre de esa persona. No dispensamos por terceros sin autorización formal — es regulación SANNA. La forma correcta: que la persona se registre y suba su receta. Tú puedes ayudarla con el trámite."

**¿Aceptan pacientes de regiones?**
> "Sí. Despachamos a todo Chile vía courier (Starken/Chilexpress). Tiempo estimado: 48-72h RM, hasta 5 días hábiles regiones extremas. Costo según destino."

**¿Hacen retiro en local?**
> "Sí. Una vez confirmado tu pago, preparamos tu pedido y te avisamos cuando esté listo. Retiro en [dirección], lun-vie 10:00-19:00 y sáb 10:00-14:00."

**¿Qué medios de pago aceptan?**
> "Por ahora: transferencia bancaria con comprobante. Estamos integrando pago automático con tarjeta para los próximos meses."

**¿Puedo pagar con tarjeta en mostrador?**
> "Sí, en mostrador aceptamos débito y crédito vía POS."

**¿Tienen consulta médica en Cultimed?**
> "Sí, ofrecemos consulta online con médicos especializados en cannabis medicinal. Puedes agendar en dispensariocultimed.cl/consulta. La receta queda subida automáticamente a tu cuenta."

**¿Mi receta puede usarse en otra farmacia?**
> "Sí, las recetas son del paciente. Pero tener cuenta en Cultimed te da acceso a nuestro catálogo, trazabilidad por lote y bitácora clínica que tu médico puede consultar."

**¿Guardan mi información médica de manera segura?**
> "Sí. Tus datos clínicos se almacenan de forma encriptada y solo accede QF autorizado. Cumplimos con la Ley 19.628 (Protección de Datos Personales en Chile). Política completa en dispensariocultimed.cl/privacidad."

**¿Qué pasa si no estoy conforme con mi compra?**
> "Si el producto tiene defecto de fabricación o llegó dañado, lo reponemos sin costo. Si simplemente no te acomoda, hablemos: ajustamos junto a la QF la próxima dispensación. Por ley sanitaria no podemos recibir devoluciones de productos abiertos."

**¿Hacen descuentos / promociones?**
> "No hacemos promociones de retail. Sí ajustamos precios cuando bajan los costos de producción. Pacientes con tratamientos extensos o de bajos recursos: hablamos caso a caso."

**¿Tienen programa de pacientes frecuentes?**
> "En desarrollo. Por ahora, los pacientes activos reciben primero los lotes nuevos y acceso a charlas con QF sin costo. Mantente en la newsletter."

**¿Cómo cancelo mi cuenta?**
> "Respondes este mensaje o escribes a hola@cultimed.cl con 'baja de cuenta' y la cerramos en 48h. Tus datos se conservan 5 años por normativa SANNA y luego se eliminan."

---

### K.2 Sobre cepas, productos y uso

**¿Qué diferencia hay entre indica y sativa?**
> "Es una distinción más cultural que científica hoy. Lo que importa es el perfil de cannabinoides (CBD/THC) y terpenos del lote específico. Te puedo guiar según tu indicación: si nos cuentas qué buscas (sueño, ansiedad, dolor), te orientamos."

**¿Qué es CBD? ¿Y THC?**
> "Son los dos cannabinoides más estudiados. CBD (cannabidiol): no es psicoactivo, asociado a efectos relajantes, antiinflamatorios, anticonvulsivantes. THC (tetrahidrocannabinol): psicoactivo, asociado a alivio del dolor, apetito y náusea. Casi todos los productos médicos combinan ambos en distintas proporciones."

**¿Qué significa 'full spectrum'?**
> "Significa que el extracto contiene todos los cannabinoides y terpenos naturales de la planta (incluyendo trazas de THC). 'Broad spectrum' es similar pero sin THC. 'Aislado' es solo un cannabinoide purificado, generalmente CBD. La evidencia sugiere que el efecto terapéutico es mejor con full o broad spectrum (por sinergia de la planta entera, llamado 'efecto séquito')."

**¿Qué es un terpeno?**
> "Son los aromáticos de la planta — los mismos compuestos que dan olor a las naranjas (limoneno) o al pino (pineno). En cannabis medicinal interactúan con los cannabinoides y modulan el efecto. Los más comunes: mirceno (relajante), limoneno (estimulante de ánimo), linalool (sedante), beta-cariofileno (antiinflamatorio)."

**¿Cuánto debo tomar? (dosis)**
> "La regla de oro es: empieza bajo, sube despacio (start low, go slow). Para aceites, generalmente 2-3 gotas sublingual y esperar 60-90 min. Si necesitas más, ajustas. Cada paciente responde distinto. Te pedimos llevar bitácora de dosis y efecto, y conversarla con tu médico o nuestra QF en consulta."

**¿En cuánto tiempo siento el efecto?**
> "Depende de la vía: sublingual (gotas bajo la lengua) 15-45 min; oral (cápsula tragada) 60-120 min; inhalado (flor) inmediato. Y la duración también varía: oral dura 6-8h; inhalado 2-4h."

**¿Puedo conducir si tomo cannabis medicinal?**
> "Si tu producto contiene THC, NO debes conducir. La normativa chilena no distingue entre uso médico y recreativo para fiscalización vial. Para productos solo CBD generalmente no hay restricción, pero te recomendamos hablarlo con tu médico."

**¿Genera dependencia?**
> "El cannabis medicinal tiene un perfil de tolerancia y dependencia muy menor comparado con benzodiacepinas u opioides, pero existe en uso prolongado de THC alto. Por eso recomendamos descansos periódicos y supervisión médica. CBD puro no genera dependencia conocida."

**¿Puedo combinarlo con mis otros remedios?**
> "Hay interacciones documentadas (especialmente con anticoagulantes, antiepilépticos y algunos antidepresivos). Antes de empezar, conversa con tu médico tratante o agenda consulta con nosotros para revisar tu tratamiento actual."

**¿Tienen para niños / pediátrico?**
> "Sí, para casos como epilepsia refractaria o autismo dispensamos productos pediátricos con receta de neurólogo o pediatra especialista. Requiere autorización del cuidador y seguimiento más estricto."

**¿Tienen para mascotas?**
> "Sí, dispensamos formulaciones veterinarias específicas con receta de médico veterinario. Importante: nunca usar producto humano en mascotas — las dosis y excipientes son diferentes."

**¿Qué cepas tienen actualmente?**
> "El stock varía por lote. Hoy tenemos: [actualizar mensualmente — formato: nombre, ratio CBD:THC, dominante terpénico, indicación común]. Cada lote tiene su COA disponible en la ficha del producto."

**¿Qué cepa me sirve para [insomnio / ansiedad / dolor / migraña / epilepsia]?**
> "Te orientamos en consulta con QF — la respuesta correcta depende de tu historial, tratamiento actual y receta médica. Como referencia general, los perfiles que solemos sugerir:
> - Insomnio: ratios altos en CBN y mirceno.
> - Ansiedad: CBD dominante, bajo THC, con linalool.
> - Dolor crónico: CBD:THC balanceado (1:1) con beta-cariofileno.
> - Epilepsia: CBD muy alto, casi sin THC.
> - Migraña: CBD dominante, sublingual."

**¿Por qué los precios cambian entre lotes?**
> "Los costos de producción varían según rendimiento de cosecha, costos de testing y duración del curado. Ajustamos para mantener márgenes razonables sin transferir todas las variaciones al paciente."

**¿Qué es un COA y por qué importa?**
> "COA = Certificate of Analysis. Es el documento que certifica el contenido exacto de cannabinoides, ausencia de pesticidas, metales pesados y microbiología del lote. Cada lote nuestro tiene COA disponible en la ficha del producto. Si no hay COA, no es medicinal — punto."

**¿Cómo guardo el producto?**
> "Aceites: lugar fresco (15-20°C), oscuro, frasco bien cerrado. Vida útil 12-18 meses sellado, 6 meses post-apertura. Flor seca: hermético, oscuro, sin humedad — idealmente con paquete de control humedad 62%. Cápsulas: temperatura ambiente, lejos de niños."

**¿Puedo viajar con mi producto?**
> "Dentro de Chile sí, llevando tu receta vigente y la boleta de Cultimed en formato físico o digital. Internacionalmente: NO sin un permiso especial — el cannabis medicinal está prohibido en muchos países aún con receta. Consulta normativa del destino antes de viajar."

---

### K.3 Sobre legalidad y normativa

**¿Es legal lo que hacen?**
> "Sí. Cultimed opera bajo autorización del ISP/SANNA como dispensario de cannabis medicinal en Chile. Solo dispensamos con receta médica vigente y mantenemos bitácora de cada dispensación según normativa."

**¿Esto sale en mis antecedentes?**
> "No. Comprar producto medicinal con receta no genera registro penal ni civil. Es un tratamiento médico como cualquier otro."

**¿Mi isapre / Fonasa cubre esto?**
> "Por ahora no hay cobertura GES ni AUGE para cannabis medicinal en Chile. Algunas isapres han empezado a aceptar reembolso parcial caso a caso — guarda tus boletas y consulta directamente."

**¿Puedo cultivar para mi propio uso?**
> "El autocultivo está en zona gris legal. La Ley 20.000 sigue vigente — el consumo personal no es delito pero el porte y cultivo pueden serlo. Recomendamos no autocultivar y dispensarte regulado."

**¿Si me detienen con producto, qué hago?**
> "Mostrar tu receta médica vigente + boleta de Cultimed con lote y trazabilidad. Tienes derecho a un abogado y a no auto-incriminarte. Si necesitas asesoría legal, te podemos derivar."

---

### K.4 Sobre Cultimed como marca

**¿Quiénes están detrás de Cultimed?**
> "Equipo de profesionales: químicos farmacéuticos, médicos colaboradores, cultivo propio, comunicación. Operamos desde [año] y cultivamos bajo estándares GACP en [región]."

**¿De dónde sacan el producto?**
> "Mayoritariamente cultivo propio en invernadero controlado (lo que dispensamos como flor y derivados directos). Para algunos formatos (ciertas cápsulas, productos veterinarios) trabajamos con laboratorios autorizados terceros con COA disponible."

**¿Por qué el sitio es tan formal? Esperaba algo más onda 'cannabis'.**
> "Porque somos un dispensario médico, no un grow shop. Tratamos cannabis como medicina, no como cultura recreativa. La estética refleja eso: serio, cálido, transparente."

**¿Tienen tienda física?**
> "Sí. [dirección + horario]. Se puede comprar en mostrador con receta + cédula."

**¿Hacen charlas / educación?**
> "Sí. Mensualmente realizamos charlas online gratuitas para pacientes y médicos. Suscripción a la newsletter para enterarte cuándo."

**¿Cómo me contacto si tengo emergencia con el producto?**
> "Si es emergencia médica grave: llama al 131 (SAMU) o ve a urgencias. Lleva tu producto contigo. Si es duda urgente no-emergencia: respondes este WhatsApp en horario hábil; fuera de horario, mail a hola@cultimed.cl."

---

> **Nota de mantención:** este FAQ se actualiza cuando aparece una pregunta nueva por 3ª vez. Cualquiera del equipo puede sugerir ediciones — Oscar valida y actualiza el doc + el sitio público.

---

## L. LO QUE SOLEMOS OLVIDAR — Contingencias y edge cases

> Las cosas que no salen en ningún plan pero que cuando pasan tumban una semana entera. Anotadas para que tengamos protocolo escrito antes de que ocurran.

### L.1 Crisis comunicacional / regulatoria

- [ ] **Fiscalización ISP / SAG / Aduana inesperada.** Persona presente llama al QF + abogado. NO destruir nada. NO dar acceso al sistema sin orden formal. Tener carpeta física con autorizaciones SANNA + última auditoría a la mano.
- [ ] **Reporte adverso de un paciente (efecto inesperado, alergia, etc.).** QF documenta caso, notifica al médico tratante si aplica, guarda lote en cuarentena hasta investigar. Si es grave: notificar ISP en 48h.
- [ ] **Lote retirado / recall.** Lista de pacientes afectados (D.3) → contacto WhatsApp + email individual + cambio o reembolso. Comunicación pública SOLO si afecta a >X pacientes (definir umbral con abogado).
- [ ] **Filtración de datos / hackeo.** Aviso a pacientes en 72h por ley. Reportar a Agencia Protección Datos. (Operación técnica la maneja el owner — el equipo apoya con la comunicación a pacientes con copy revisado por abogado.)
- [ ] **Review pública negativa (Instagram, Google, prensa).** Responder profesionalmente en <24h, ofrecer canal privado. Nunca borrar reviews. Nunca discutir caso médico en público.
- [ ] **Periodista / medio pidiendo entrevista.** No improvisar. Escribir respuesta consensuada con abogado. Tener 1 vocero designado (Oscar o QF principal).
- [ ] **Demanda / juicio.** Carpeta legal lista: TyC, política privacidad, autorización SANNA, contratos proveedores, bitácora paciente.

### L.2 Continuidad operacional

- [ ] **QF se enferma o renuncia.** ¿Tenemos QF de reemplazo de guardia? Contrato con QF independiente part-time como respaldo. Sin QF NO se dispensa — definido por ley.
- [ ] **Caída de plataforma (admin o store).** Plan B: dispensar manualmente con planilla papel/Excel, entregar boleta física, sincronizar al volver el sistema. (El owner tiene el protocolo técnico de recuperación.)
- [ ] **Robo / vandalismo en local.** Cámara con grabación 30d, alarma con monitoreo, caja fuerte para producto, seguro contratado. Inventario físico semanal cruzado con sistema.
- [ ] **Corte de luz / internet prolongado.** Mostrador con calculadora física para emergencias. Lista de datos bancarios en papel. Conocer datos de contacto del proveedor de internet.
- [ ] **Cultivo: pérdida de cosecha (plaga, hongo, falla técnica).** Plan B: red de productores autorizados terceros para cubrir hueco temporal. Comunicación honesta con pacientes ("este mes el lote X no estará — alternativa Y").

### L.3 Pacientes problemáticos / éticamente complejos

- [ ] **Sospecha de reventa.** Patrones: compra muy frecuente, volumen muy alto vs. receta, paga en efectivo siempre, evita preguntas clínicas. Política: rebajar dispensación a lo estrictamente recetado, no más. Si insiste: derivar a QF para conversación, eventualmente cerrar cuenta. Documentar todo.
- [ ] **Paciente bajo influencia agresiva en mostrador.** No discutir, no atender, llamar a Carabineros si hay riesgo. Volver a contactar al día siguiente para resolver.
- [ ] **Paciente con receta dudosa.** Llamar al médico prescriptor para confirmar. Si no se puede verificar en 24h: rechazar receta hasta tener confirmación.
- [ ] **Paciente menor sin tutor.** No dispensar bajo ninguna circunstancia. Pediátrico requiere tutor presente o autorización notarial.
- [ ] **Paciente con sospecha de uso problemático (signos de adicción, uso fuera de indicación clínica).** QF agenda consulta privada, ofrece derivación a salud mental, no dispensación adicional sin evaluación.
- [ ] **Paciente que pide datos de otro paciente.** NUNCA. Ni siquiera familiar directo. Solo si hay autorización notarial o muerte certificada.

### L.4 Operación interna olvidada

- [ ] **Contabilidad y SII.** Boletas electrónicas timbradas, libro de ventas mensual, pago IVA, retenciones. Contador con acceso al CSV mensual.
- [ ] **Sueldos y previsión.** AFP, Fonasa/Isapre, seguro cesantía, contratos formales. Previred o software equivalente.
- [ ] **Seguros.** Local (incendio, robo), responsabilidad civil profesional QF, ciber, cargo, vida si aplica.
- [ ] **Derecho laboral.** Reglamento interno publicado. Vacaciones registradas. Permisos médicos. Manejo de licencias.
- [ ] **Facturación a terceros.** Si vendemos a clínicas, asociaciones de pacientes, etc. — necesitamos factura electrónica (no solo boleta).
- [ ] **Inventario seguridad.** Punto de reorden por SKU (cuántas unidades antes de avisar a cultivo). Stock de seguridad por variedad (no quedarnos sin la del paciente recurrente).
- [ ] **Onboarding nuevo miembro de equipo.** Doc paso a paso: 1) bienvenida + valores; 2) accesos (cuentas, contraseñas); 3) procedimiento por rol; 4) shadow primera semana; 5) revisión 30/60/90 días.
- [ ] **Política de muestras / regalos.** ¿Le damos producto al equipo? ¿A pacientes en duelo? ¿A médicos prescriptores? Política escrita: pequeñas cantidades, registradas en bitácora, nunca como soborno o promoción comercial.
- [ ] **Política de eventos / ferias.** ¿Asistimos a ferias de salud? ¿Charlas en colegios médicos? Brief unificado, material visual, 1 vocero, presupuesto/año.
- [ ] **Programa de embajadores / pacientes ejemplo.** Si un paciente quiere compartir su experiencia públicamente, consentimiento informado escrito + revisión legal del testimonio. Nunca presionar.
- [ ] **Donaciones y casos sociales.** Política para pacientes sin recursos: dosis mínima sin costo + plan de pago para resto. Cupos al mes definidos por presupuesto. Comunicación discreta.

### L.5 Salud mental del equipo

- [ ] **Espacios de descompresión.** Trabajar con pacientes oncológicos, epilepsia refractaria, casos terminales pesa. Ritual mensual: 30 min team check-in emocional. Acceso a psicólogo si alguien lo pide.
- [ ] **Límites con pacientes.** El equipo no es servicio de urgencia 24/7. Horarios claros + mensaje de ausencia + derivación a 131 cuando aplica.
- [ ] **Vacaciones obligatorias.** Mínimo 1 semana corrida al año por persona. Quien no toma vacaciones, se quema.

### L.6 Identidad y branding consistencia

- [ ] **Manual de marca lite versionado.** Si decidimos cambiar paleta o tipografía, todos los activos del equipo deben actualizarse en 30 días (login, email, IG highlights, newsletter).
- [ ] **Naming consistente.** ¿"Cultimed" o "CULTIMED"? ¿"Dispensario Cultimed" formal vs. "Cultimed" informal? Decidir y aplicar transversal.
- [ ] **Memoria de comunicación.** Los copys que ya enviamos no se repiten al pie de la letra. Banco de mensajes con fecha último uso.
- [ ] **Coherencia store ↔ admin ↔ social ↔ presencial.** Auditoría trimestral: ¿el paciente vive la misma marca en los 4 puntos de contacto?

---

## M. RECORDATORIO FINAL

> *"El dispensario de Chile que se mira en el espejo de una clínica suiza o una farmacia de Harvard — pero habla como un paciente chileno."*

Cada decisión que tomemos tiene que pasar por ese filtro. Si una promo, un copy o una funcionalidad nos hace ver más como un grow shop o un headshop, se descarta. Si nos hace ver más como una farmacia seria y cálida, va.

Y si tenemos dudas, preguntamos antes de publicar. Es más barato preguntar.

---

**Próxima revisión de este documento:** lunes siguiente al lanzamiento.
