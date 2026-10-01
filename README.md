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

La extracción está validada con un statement Wells Fargo de ocho páginas y 27 movimientos. Otros formatos deben revisarse. El editor conserva el original y genera una copia corregida. No incluye OCR. Si la fuente, codificación u operadores de un campo no permiten conservarlo con precisión, la exportación informa del problema en lugar de alterar el diseño. No se incluyen documentos reales ni datos financieros en este repositorio.

## Ejecutar localmente

No requiere compilación ni npm. Desde esta carpeta:

```bash
python3 -m http.server 8000 --directory dist
```

Abre `http://localhost:8000`. Para instalarla o usar sus funciones PWA en otro dispositivo, publícala con HTTPS.

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
- `dist/pdf-edit.mjs`: corrección de operadores de texto con la fuente original.
- `dist/download.mjs`, `install.mjs`: descarga e instalación.
- `dist/sw.js`, `manifest.webmanifest`: PWA y caché.
- `dist/vendor/`: dependencias incluidas para trabajar sin conexión.
- `.github/workflows/pages.yml`: despliegue opcional en GitHub Pages.

## Dependencias

PDF.js y pdf-lib se distribuyen con sus licencias en `dist/vendor/`. Consulta `THIRD_PARTY_NOTICES.md`. No se necesitan claves API ni secretos.
