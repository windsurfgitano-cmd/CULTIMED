# Apps nativas Cultimed — builds y publicación

La app nativa es un shell de Capacitor que carga https://dispensariocultimed.cl
(config en `cultimed-store/capacitor.config.ts`). El checkout dentro de la app
se completa en el navegador del sistema (requisito de Google Play para cannabis;
ya implementado en `CheckoutClient.tsx`).

Antes de cualquier build, si hubo cambios de config o plugins:
`cd cultimed-store && npx cap sync`

## Android — probar en el celular (APK debug)

Requisitos en este PC (ya configurados): SDK en `%LOCALAPPDATA%\Android\Sdk`,
JDK portable en `%LOCALAPPDATA%\Java\jdk-21.0.11+10`, `android/local.properties`.

```bash
cd cultimed-store/android
JAVA_HOME="C:\Users\Ozymandias\AppData\Local\Java\jdk-21.0.11+10" ./gradlew assembleDebug
```

APK resultante: `android/app/build/outputs/apk/debug/app-debug.apk`.
Instalarlo: mandarlo al teléfono (WhatsApp/Drive/cable) y abrirlo — Android
pide permitir "instalar apps de origen desconocido" para esa vía; es normal
en builds de prueba.

## Android — publicar en Play Store (AAB firmado)

1. Generar keystore UNA sola vez (¡guardarlo con vida — sin él no hay updates!):
   ```bash
   "%LOCALAPPDATA%\Java\jdk-21.0.11+10\bin\keytool" -genkey -v -keystore cultimed-release.keystore -alias cultimed -keyalg RSA -keysize 2048 -validity 10000
   ```
   Guardar keystore + contraseñas en un lugar seguro (NO commitearlo).
2. Configurar signing en `android/app/build.gradle` (bloque `signingConfigs`).
3. `./gradlew bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab`.
4. Play Console (cuenta ya creada): crear app → subir AAB a prueba interna →
   completar ficha (descripciones, screenshots, clasificación de contenido,
   declaración de app de cannabis medicinal con venta FUERA de la app).
5. Restricción de países: solo Chile.

## iOS — probar en el iPhone (desde el Mac)

1. En el Mac: clonar/pull del repo, `cd cultimed-store && npm install && npx cap sync ios`.
2. `npx cap open ios` (abre Xcode con el proyecto App).
3. En Xcode → target App → Signing & Capabilities: elegir el Team de la cuenta
   de developer. Bundle ID: `cl.dispensariocultimed.app`.
4. Conectar el iPhone por cable, elegirlo como destino, ▶ Run.
   (Primera vez: en el iPhone, Ajustes → General → VPN y gestión de
   dispositivos → confiar en el certificado de developer.)

## iOS — publicar en App Store

1. Xcode → Product → Archive → Distribute App → App Store Connect.
2. App Store Connect: crear la app, subir el build, completar ficha.
3. **Requisito Apple para apps de dispensario:** la cuenta de developer debe
   ser de tipo **Organización** (no Individual) y la app debe estar
   geo-restringida a Chile (Pricing and Availability → solo Chile).
4. TestFlight primero para probarla instalada "de verdad" antes del review.

## Pendientes antes de enviar a las stores

- [ ] Reemplazar iconos/splash placeholder por el logo real
      (`cultimed-store/resources/icon.png` y `splash.png`, luego
      `npx capacitor-assets generate` + `npx cap sync`).
- [ ] Confirmar que la cuenta Apple es tipo Organización.
- [ ] Screenshots de la app para ambas fichas.
- [ ] Textos de ficha (descripción corta/larga) — enfatizar dispensario
      medicinal autorizado, receta obligatoria, Ley 20.850.
