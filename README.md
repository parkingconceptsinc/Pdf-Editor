# PCI PDF Studio

PWA en español para corregir fechas e importes de PDFs y revisar statements. Los documentos se procesan y guardan en el navegador del usuario; no se envían a un servidor.

## Funciones

- Importación de varios PDFs con texto seleccionable.
- Corrección de fechas individual o en grupo.
- Edición de importes; depósitos, retiros y saldos bancarios se recalculan.
- Exportación del PDF con las fuentes y recursos originales, sin rasterizar ni rediseñar sus páginas.
- Exportación CSV y XLS compatible (SpreadsheetML/XML de Excel; no es BIFF binario).
- Instalación PWA, caché sin conexión y almacenamiento local IndexedDB.
- Logos configurables por dispositivo.
- Asistente IA opcional con [OmniRoute](https://github.com/diegosouzapw/OmniRoute): resumir, traducir, revisar importes y preguntar sobre el documento.

La extracción está validada con un statement Wells Fargo de ocho páginas y 27 movimientos. Otros formatos deben revisarse. El editor conserva el original y genera una copia corregida. No incluye OCR. Si la fuente, codificación u operadores de un campo no permiten conservarlo con precisión, la exportación informa del problema en lugar de alterar el diseño. No se incluyen documentos reales ni datos financieros en este repositorio.

## Ejecutar localmente

No requiere compilación ni npm. Desde esta carpeta:

```bash
python3 -m http.server 8000 --directory dist
```

Abre `http://localhost:8000`. Para instalarla o usar sus funciones PWA en otro dispositivo, publícala con HTTPS.

## Asistente IA con OmniRoute

La pestaña **Asistente IA** envía el texto del documento actual a un servidor [OmniRoute](https://github.com/diegosouzapw/OmniRoute), un gateway de IA gratuito y compatible con OpenAI que elige el modelo y cambia a otro si uno falla o se queda sin cuota. Es opcional: si no se usa, ningún documento sale del navegador.

1. Inicia OmniRoute en tu computadora: `docker run -p 20128:20128 diegosouzapw/omniroute` o `npm install -g omniroute && omniroute` (Node 22 o 24).
2. Abre el panel en `http://localhost:20128`, conecta tus proveedores en **Providers** y copia la clave en **Endpoints**.
3. En la app, abre **Asistente IA → Conexión con OmniRoute**, pega la dirección (`http://localhost:20128/v1`) y la clave, y pulsa **Guardar y probar**. Usa el modelo `auto` para que OmniRoute elija.
4. Marca la casilla de consentimiento antes de enviar un documento.

La dirección, la clave y el modelo se guardan solo en el navegador de cada dispositivo. Los documentos largos se recortan a 30.000 caracteres. Los PDF escaneados sin texto no se pueden analizar porque la app no incluye OCR. Si publicas la app con HTTPS y OmniRoute está en tu computadora, el navegador puede pedir permiso para acceder a la red local. Para usarla desde otros dispositivos, aloja OmniRoute en un servidor con HTTPS y una clave.

## Publicar en GitHub Pages

1. Sube el contenido completo del proyecto al repositorio (incluidos `dist/` y `.github/`).
2. En **Settings > Pages**, selecciona **GitHub Actions** como origen.
3. Ejecuta el workflow **Publish PCI PDF Studio** o sube un cambio a `main`.
4. Abre la dirección que devuelve el despliegue. La aplicación utiliza rutas relativas y puede alojarse bajo una ruta de proyecto.

GitHub Pages necesita estar disponible para tu repositorio y cuenta. Revisa quién podrá acceder a la web antes de habilitar su publicación. Los documentos se mantienen en cada dispositivo y no están en el repositorio.

## Instalar

- Android: abre la web en Chrome y pulsa **Instalar app**. Si no aparece el aviso automático, utiliza la opción de instalación del menú de Chrome.
- iPhone/iPad: abre la web en Safari, pulsa **Compartir > Añadir a pantalla de inicio**, activa **Abrir como app web** si aparece y confirma.
- Computadora: abre la web en Chrome y utiliza **Instalar app** o la opción **Instalar página como aplicación** del menú del navegador.

Si la abres dentro de otra aplicación, copia su enlace y ábrelo en tu navegador habitual. La instalación no requiere descargar un APK.

## Estructura

- `dist/index.html`, `style.css`: interfaz.
- `dist/app.js`: importación, edición, almacenamiento y exportación.
- `dist/core.mjs`: detección, fechas, cálculos y exports tabulares.
- `dist/ai.mjs`: cliente de OmniRoute y preparación del texto para el asistente IA.
- `dist/pdf-edit.mjs`: corrección de operadores de texto con la fuente original.
- `dist/download.mjs`, `install.mjs`: descarga e instalación.
- `dist/sw.js`, `manifest.webmanifest`: PWA y caché.
- `dist/vendor/`: dependencias incluidas para trabajar sin conexión.
- `.github/workflows/pages.yml`: despliegue opcional en GitHub Pages.

## Dependencias

PDF.js y pdf-lib se distribuyen con sus licencias en `dist/vendor/`. Consulta `THIRD_PARTY_NOTICES.md`. Las funciones principales no necesitan claves API. El asistente IA usa la clave de tu propio OmniRoute, que se introduce en la app y no se guarda en el repositorio.
