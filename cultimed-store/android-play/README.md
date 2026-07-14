# android-play — Variante de Cultimed para Google Play

Esta es la **variante de la app Android destinada a Google Play**, separada a
propósito del proyecto `../android/` (el APK "directo" que se reparte por Signal
y corre con el checkout completo adentro).

## Por qué existe (la diferencia real)

Google Play **prohíbe el carrito/pago de cannabis dentro de la app**, sea legal
o no. La única salida aceptada: que el pago se abra en el **navegador del
sistema**, fuera de la app.

Esta variante logra eso con **una sola diferencia** respecto a `../android/`:
en `app/src/main/assets/capacitor.config.json` agrega

```json
"android": { "appendUserAgent": "CultimedPlay" }
```

Eso hace que el WebView anuncie "CultimedPlay" en su user-agent. El checkout
(en `cultimed-store/app/checkout/CheckoutClient.tsx`) ya detecta esa marca
(`isNativeApp() && navigator.userAgent.includes("CultimedPlay")`) y, cuando la
ve, manda el pago al navegador en vez de completarlo adentro. Todo lo demás
(mismo sitio en vivo, mismos íconos, misma firma) es idéntico.

| | `../android/` (directo / Signal) | `android-play/` (esta) |
|---|---|---|
| Checkout | Completo dentro de la app | Se abre en el navegador |
| Destino | Sideload por Signal / uso directo | Google Play Store |
| UA extra | — | `CultimedPlay` |

## Cómo construir

Requiere lo mismo que el build directo (ver
`../../.claude`/memoria y `docs/apps-nativas.md`): SDK Android, JDK 21 portable,
y el keystore de release (`cultimed-release.keystore` + `keystore.properties`,
ambos gitignored, copiados desde `../android/`).

```bash
cd cultimed-store/android-play
JAVA_HOME="C:\Users\Ozymandias\AppData\Local\Java\jdk-21.0.11+10" \
JAVA_TOOL_OPTIONS="-Djdk.net.unixdomain.tmpdir=C:/Users/Public/uds" \
./gradlew bundleRelease      # -> app/build/outputs/bundle/release/app-release.aab (para Play)
./gradlew assembleRelease    # -> app/build/outputs/apk/release/app-release.apk (para probar el flujo Play en un celular)
```

El **.aab** es lo que se sube a Google Play Console. El **.apk** sirve para
probar en tu propio celular que el checkout efectivamente se va al navegador
(ojo: mismo appId `cl.dispensariocultimed.app` que el directo — desinstala el
directo antes de instalar este para probar).

## Mantención (importante)

Como es una **copia**, no se sincroniza sola con `../android/`. Si en el futuro
cambian los íconos, permisos o plugins nativos, hay que **re-aplicar esos
cambios aquí también** (o re-copiar `../android/` y volver a poner el
`appendUserAgent`). El contenido de la app (páginas, precios, checkout) NO
requiere re-build: viene del sitio en vivo.

## Estado

Firmado con el mismo keystore de release que el APK directo. Pendiente para
publicar: cuenta de Google Play (empresa + D-U-N-S de Cultimed SpA), ficha
(screenshots, descripción, clasificación 18+, formulario de seguridad de datos).
Ver `docs/apps-nativas.md`.
