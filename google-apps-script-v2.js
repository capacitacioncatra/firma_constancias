/**
 * GOOGLE APPS SCRIPT - Sistema de Firmas Digitales (VERSIÓN CORREGIDA CON CORS)
 * 
 * INSTRUCCIONES RÁPIDAS:
 * 1. Hoja debe llamarse: "Firmas"
 * 2. Columnas: ID | Nombre Completo | CURP/RFC | Firma | Fecha
 * 3. Copia este código completo en Apps Script
 * 4. Implementar → Aplicación web → Cualquier persona
 * 5. Copia la URL y pégala en config.js
 */

function doGet(e) {
  const action = e.parameter.action || '';
  
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Firmas');
    
    if (!sheet) {
      return jsonResponse({ error: 'La hoja "Firmas" no existe. Créala o verifica el nombre.' });
    }
    
    // Obtener todas las firmas
    if (action === 'getAll') {
      const data = sheet.getDataRange().getValues();
      const firmas = [];
      
      for (let i = 1; i < data.length; i++) {
        if (data[i][0]) { // Si tiene ID
          firmas.push({
            id: String(data[i][0]),
            fullName: String(data[i][1]),
            document: String(data[i][2]),
            signature: String(data[i][3]),
            timestamp: String(data[i][4])
          });
        }
      }
      
      return jsonResponse(firmas);
    }
    
    // Buscar firmas
    if (action === 'search') {
      const query = (e.parameter.query || '').toLowerCase();
      const data = sheet.getDataRange().getValues();
      const resultados = [];
      
      for (let i = 1; i < data.length; i++) {
        if (!data[i][0]) continue;
        
        const nombre = String(data[i][1]).toLowerCase();
        const doc = String(data[i][2]).toLowerCase();
        
        if (nombre.includes(query) || doc.includes(query)) {
          resultados.push({
            id: String(data[i][0]),
            fullName: String(data[i][1]),
            document: String(data[i][2]),
            signature: String(data[i][3]),
            timestamp: String(data[i][4])
          });
        }
        
        if (resultados.length >= 50) break; // Límite de 50 resultados
      }
      
      return jsonResponse(resultados);
    }
    
    // Obtener por ID
    if (action === 'getById') {
      const id = e.parameter.id;
      const data = sheet.getDataRange().getValues();
      
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(id)) {
          return jsonResponse({
            id: String(data[i][0]),
            fullName: String(data[i][1]),
            document: String(data[i][2]),
            signature: String(data[i][3]),
            timestamp: String(data[i][4])
          });
        }
      }
      
      return jsonResponse({ error: 'Firma no encontrada' });
    }
    
    return jsonResponse({ error: 'Acción no válida' });
    
  } catch (error) {
    return jsonResponse({ error: error.toString() });
  }
}

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Firmas');
    
    if (!sheet) {
      return jsonResponse({ success: false, error: 'La hoja "Firmas" no existe' });
    }
    
    const datos = JSON.parse(e.postData.contents);
    const action = datos.action;
    
    // Guardar firma
    if (action === 'save') {
      const firma = datos.data;
      
      sheet.appendRow([
        firma.id,
        firma.fullName,
        firma.document,
        firma.signature,
        firma.timestamp
      ]);
      
      return jsonResponse({ success: true, id: firma.id });
    }
    
    // Eliminar firma
    if (action === 'delete') {
      const id = datos.id;
      const data = sheet.getDataRange();
      const values = data.getValues();
      
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][0]) === String(id)) {
          sheet.deleteRow(i + 1);
          return jsonResponse({ success: true });
        }
      }
      
      return jsonResponse({ success: false, error: 'Firma no encontrada' });
    }
    
    return jsonResponse({ success: false, error: 'Acción no válida' });
    
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

// Función helper para respuestas JSON
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
