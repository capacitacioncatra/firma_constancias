# 📝 Sistema de Firmas Digitales - Versión Local

Sistema web completo para capturar firmas digitales con información de usuarios. Perfecto para procesos de consentimientos, contratos o documentos que requieren firma.

## 🚀 Características

- ✅ **100% Local** - No requiere servidor, funciona directo en el navegador
- ✅ **Captura de Firmas** - Interfaz táctil para dibujar firmas
- ✅ **OCR Automático** - Extrae texto de PDFs escaneados
- ✅ **Firma de PDFs** - Inserta firmas digitales en documentos
- ✅ **Búsqueda Inteligente** - Encuentra firmas por nombre o CURP/RFC
- ✅ **Almacenamiento Local** - Todo se guarda en el navegador (localStorage)

## 📁 Archivos del Proyecto

```
├── index.html          → Página de captura de firmas (usuarios)
├── admin-simple.html   → Panel de administración (firmar PDFs)
├── app.js             → Lógica de captura de firmas
├── admin-simple.js    → Lógica de OCR y firmado de PDFs
├── styles.css         → Estilos compartidos
└── README.md          → Esta documentación
```

## 🚀 Uso Rápido

### 1. Capturar Firmas (Usuarios)

1. Abre `index.html` en el navegador (doble clic)
2. Ingresa nombre completo y CURP/RFC
3. Dibuja la firma en el canvas
4. Clic en **"Guardar Firma"**

### 2. Firmar Documentos (Administración)

1. Abre `admin-simple.html` en el navegador
2. **Configura la firma del representante** (solo una vez):
   - Clic en "⚙️ Configurar Firma Representante"
   - Sube la imagen de la firma
   - Guardar
3. **Firma un documento**:
   - Sube el PDF o imagen del documento
   - El sistema automáticamente:
     - Extrae el texto con OCR
     - Detecta nombre y CURP/RFC
     - Busca la firma correspondiente
   - Ajusta las coordenadas si es necesario
   - Clic en **"✨ Firmar y Descargar PDF"**

## 🔧 Tecnologías Utilizadas

- **HTML5 Canvas** - Captura de firmas
- **JavaScript Vanilla** - Lógica de aplicación
- **LocalStorage** - Almacenamiento de datos
- **PDF-Lib** - Manipulación de PDFs
- **Tesseract.js** - OCR (reconocimiento de texto)
- **PDF.js** - Renderizado de PDFs

## 📋 Requisitos

- Navegador moderno (Chrome, Edge, Firefox)
- Conexión a Internet (solo para cargar librerías CDN la primera vez)

## ⚙️ Configuración de Coordenadas

Las firmas se insertan en coordenadas específicas del PDF. Puedes ajustarlas en el panel de administración:

- **Usuario (X, Y)**: Posición de la firma del usuario
- **Representante (X, Y)**: Posición de la firma del representante

Las coordenadas se miden desde la **esquina inferior izquierda** del PDF.

## 📱 Uso en Dispositivos Móviles

El sistema funciona perfectamente en tablets y smartphones:
1. Abre los archivos en el navegador móvil
2. Usa el dedo para dibujar la firma
3. Todo se sincroniza automáticamente

## 🔒 Privacidad y Seguridad

- ✅ Todos los datos se almacenan **localmente en tu navegador**
- ✅ No se envía información a servidores externos
- ✅ Las librerías se cargan desde CDN públicos de confianza

## 📤 Preparar para GitHub

Para subir a GitHub:

```bash
git init
git add .
git commit -m "Sistema de firmas digitales - Versión local"
git branch -M main
git remote add origin https://github.com/tu-usuario/tu-repo.git
git push -u origin main
```

## 🐛 Solución de Problemas

### Las firmas no aparecen
- Verifica que estés usando el mismo navegador
- Revisa la consola (F12) para ver errores

### El OCR no funciona
- Verifica tu conexión a Internet (primera vez)
- Asegúrate de subir imágenes claras y legibles
- El proceso tarda 30-60 segundos

### No encuentra las firmas
- Verifica que el nombre/CURP esté escrito correctamente
- Usa el botón "Buscar Firma Manualmente" para reintentar

## 📄 Licencia

MIT License - Uso libre

## 👨‍💻 Desarrollo

Proyecto desarrollado para facilitar la firma digital de documentos de manera local y segura.
