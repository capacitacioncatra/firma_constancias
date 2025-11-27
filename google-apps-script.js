/**
 * GOOGLE APPS SCRIPT - Sistema de Firmas Digitales
 * 
 * INSTRUCCIONES DE INSTALACIÓN:
 * 
 * 1. Crea una nueva Google Sheet con estas columnas en la primera fila:
 *    A: ID | B: Nombre Completo | C: CURP/RFC | D: Firma (Base64) | E: Fecha
 * 
 * 2. Nombra la hoja como "Firmas" (sin comillas)
 * 
 * 3. Ve a Extensiones → Apps Script
 * 
 * 4. Borra el código predeterminado y pega este código
 * 
 * 5. Haz clic en "Implementar" → "Nueva implementación"
 *    - Tipo: Aplicación web
 *    - Ejecutar como: Yo
 *    - Quién puede acceder: Cualquier persona
 * 
 * 6. Haz clic en "Implementar" y copia la URL que te da
 * 
 * 7. Pega esa URL en el archivo config.js en la línea:
 *    SHEETS_API_URL: 'TU_URL_AQUI'
 */

function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Firmas');
    
    if (!sheet) {
      return createCORSResponse({
        error: 'No se encontró la hoja "Firmas"'
      });
    }
    
    const action = e.parameter.action;
    
    // Búsqueda de firmas
    if (action === 'search') {
      const query = e.parameter.query.toLowerCase();
      const data = sheet.getDataRange().getValues();
      const results = [];
      
      // Saltar la primera fila (encabezados)
      for (let i = 1; i < data.length; i++) {
        const fullName = String(data[i][1]).toLowerCase();
        const document = String(data[i][2]).toLowerCase();
        
        // Buscar en nombre o documento
        if (fullName.includes(query) || document.includes(query)) {
          results.push({
            id: data[i][0],
            fullName: data[i][1],
            document: data[i][2],
            signature: data[i][3],
            timestamp: data[i][4]
          });
        }
        
        // Limitar a 50 resultados para no sobrecargar
        if (results.length >= 50) break;
      }
      
      return ContentService.createTextOutput(JSON.stringify(results))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Obtener todas las firmas (NO RECOMENDADO para muchas firmas)
    if (action === 'getAll') {
      const data = sheet.getDataRange().getValues();
      const signatures = [];
      
      for (let i = 1; i < data.length; i++) {
        signatures.push({
          id: data[i][0],
          fullName: data[i][1],
          document: data[i][2],
          signature: data[i][3],
          timestamp: data[i][4]
        });
      }
      
      return ContentService.createTextOutput(JSON.stringify(signatures))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Obtener firma por ID
    if (action === 'getById') {
      const id = e.parameter.id;
      const data = sheet.getDataRange().getValues();
      
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(id)) {
          const signature = {
            id: data[i][0],
            fullName: data[i][1],
            document: data[i][2],
            signature: data[i][3],
            timestamp: data[i][4]
          };
          
          return ContentService.createTextOutput(JSON.stringify(signature))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Firma no encontrada'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      error: 'Acción no válida'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Firmas');
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'No se encontró la hoja "Firmas"'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    // Guardar nueva firma
    if (action === 'save') {
      const signatureData = data.data;
      
      sheet.appendRow([
        signatureData.id,
        signatureData.fullName,
        signatureData.document,
        signatureData.signature,
        signatureData.timestamp
      ]);
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        id: signatureData.id
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Eliminar firma por ID
    if (action === 'delete') {
      const id = data.id;
      const dataRange = sheet.getDataRange();
      const values = dataRange.getValues();
      
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][0]) === String(id)) {
          sheet.deleteRow(i + 1);
          
          return ContentService.createTextOutput(JSON.stringify({
            success: true
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Firma no encontrada'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Acción no válida'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Función helper para crear respuestas con CORS
function createCORSResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  
  return output;
}
