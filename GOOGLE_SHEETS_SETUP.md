# 📋 Guía de Configuración - Google Sheets

## 🎯 Paso 1: Crear la Google Sheet

1. Ve a https://sheets.google.com
2. Crea una nueva hoja de cálculo
3. Nómbrala: **"Sistema de Firmas Digitales"**
4. En la primera hoja, cámbiale el nombre a: **"Firmas"** (importante, debe ser exactamente ese nombre)
5. En la primera fila, agrega estos encabezados:

| A | B | C | D | E |
|---|---|---|---|---|
| ID | Nombre Completo | CURP/RFC | Firma (Base64) | Fecha |

## 🔧 Paso 2: Configurar Google Apps Script

1. En tu Google Sheet, ve a **Extensiones** → **Apps Script**
2. Borra todo el código que aparece por defecto
3. Abre el archivo `google-apps-script.js` de este proyecto
4. Copia TODO el código y pégalo en el editor de Apps Script
5. Haz clic en el ícono de **guardar** (💾)
6. Ponle un nombre al proyecto, por ejemplo: "API Firmas Digitales"

## 🚀 Paso 3: Implementar el Script

1. En Apps Script, haz clic en **Implementar** → **Nueva implementación**
2. Haz clic en el ícono de ⚙️ junto a "Seleccionar tipo"
3. Selecciona **Aplicación web**
4. Configura así:
   - **Descripción**: "API Sistema de Firmas"
   - **Ejecutar como**: Yo (tu correo)
   - **Quién tiene acceso**: **Cualquier persona**
5. Haz clic en **Implementar**
6. Aparecerá un mensaje de permisos, haz clic en **Autorizar acceso**
7. Selecciona tu cuenta de Google
8. Haz clic en **Configuración avanzada** → **Ir a [nombre del proyecto] (no seguro)**
9. Haz clic en **Permitir**
10. **¡IMPORTANTE!** Copia la **URL de la aplicación web** que aparece (algo como: `https://script.google.com/macros/s/ABC123.../exec`)

## ⚙️ Paso 4: Configurar el Sistema

1. Abre el archivo `config.js` en tu proyecto
2. Reemplaza `'TU_URL_AQUI'` con la URL que copiaste:

```javascript
const CONFIG = {
    SHEETS_API_URL: 'https://script.google.com/macros/s/TU_ID_AQUI/exec',
    USE_GOOGLE_SHEETS: true
};
```

3. Guarda el archivo

## 📤 Paso 5: Subir Cambios a GitHub

Abre una terminal en tu proyecto y ejecuta:

```powershell
cd "c:\Users\manmo\OneDrive\Escritorio\Firma de constancias"
git add .
git commit -m "Integración con Google Sheets"
git push origin main
```

## ✅ Paso 6: Verificar que Funciona

1. Ve a tu sitio en GitHub Pages: `https://capacitacioncatra.github.io/firma_constancias/`
2. Captura una firma de prueba
3. Ve al panel de administración: `https://capacitacioncatra.github.io/firma_constancias/admin-simple.html`
4. Busca la firma que acabas de capturar
5. Verifica en tu Google Sheet que aparezca la firma guardada

## 🔄 Cómo Funciona

### Para Usuarios (Captura de Firmas)
1. Los usuarios ingresan a la página principal
2. Llenan su nombre y CURP/RFC
3. Dibujan su firma
4. Al guardar, la firma se envía a Google Sheets
5. Tarda 2-4 segundos en guardarse

### Para Administradores (Firmar PDFs)
1. Buscan una firma por nombre o CURP (en lugar de cargar todas)
2. Solo se cargan los resultados de búsqueda (rápido)
3. Seleccionan la firma deseada
4. Cargan el PDF y lo firman automáticamente con OCR

## 🎛️ Modo de Desarrollo

Si quieres probar localmente con localStorage antes de usar Google Sheets:

```javascript
const CONFIG = {
    SHEETS_API_URL: 'https://script.google.com/macros/s/TU_ID_AQUI/exec',
    USE_GOOGLE_SHEETS: false  // ← Cambiar a false
};
```

## 🐛 Solución de Problemas

### Error: "No se encontró la hoja Firmas"
- Verifica que la hoja se llame exactamente **"Firmas"** (sin comillas, con F mayúscula)

### Error: "Permission denied"
- Ve a Apps Script → Implementar → Administrar implementaciones
- Haz clic en ⚙️ → Editar
- Verifica que "Quién tiene acceso" sea **"Cualquier persona"**

### Las firmas no se guardan
- Abre la consola del navegador (F12)
- Revisa si hay errores
- Verifica que la URL en `config.js` sea correcta
- Verifica que `USE_GOOGLE_SHEETS` esté en `true`

### La búsqueda no funciona
- Verifica que haya firmas en la Google Sheet
- Intenta buscar con al menos 3 caracteres
- Revisa la consola del navegador por errores

## 📊 Límites de Google Sheets

- **Ejecuciones**: 20,000 por día (suficiente para 20,000 firmas/día)
- **Tiempo de ejecución**: 6 minutos por ejecución
- **Celdas**: 10 millones (suficiente para ~2 millones de firmas)
- **Tamaño**: Sin límite de almacenamiento

## 💡 Ventajas del Sistema

✅ Completamente gratis
✅ Búsqueda rápida (solo carga lo necesario)
✅ No hay límite de firmas (hasta 2 millones)
✅ Accesible desde cualquier dispositivo
✅ Respaldo automático en Google Drive
✅ Puedes ver/editar firmas directamente en la hoja

## 📞 Soporte

Si tienes problemas:
1. Revisa la consola del navegador (F12 → Console)
2. Verifica los pasos de configuración
3. Comprueba que la URL en `config.js` sea correcta
