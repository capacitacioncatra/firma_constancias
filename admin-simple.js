// Inicializar Firebase
let db;
if (CONFIG.USE_FIREBASE && typeof firebase !== 'undefined') {
    firebase.initializeApp(CONFIG.firebase);
    db = firebase.firestore();
    console.log('✅ Firebase inicializado en admin');
}

// Sistema de firmado de PDFs - Modo Local (sin servidor) con OCR
class SimpleAdminPDF {
    constructor() {
        this.currentPdfBytes = null;
        this.currentPdfFile = null;
        this.currentImageData = null; // Guardar imagen original para overlay
        this.currentSignature = null;
        this.representantSignature = null;
        this.extractedText = '';
        this.filesQueue = []; // Cola de archivos para procesar
        this.processedFiles = []; // Archivos ya procesados
        
        // ✅ COORDENADAS UNIFICADAS para todas las firmas (individual y por lotes)
        // Ajusta estas coordenadas según tu plantilla de documento
        this.COORDENADAS = {
            usuario: {
                x: 171,      // Posición horizontal desde la izquierda
                y: 1150,     // Posición vertical desde abajo
                ancho: 400,  // Ancho de la firma
                alto: 200    // Alto de la firma
            },
            representante: {
                x: 650,      // Posición horizontal desde la izquierda
                y: 1130,     // Posición vertical desde abajo
                ancho: 500,  // Ancho de la firma
                alto: 200    // Alto de la firma
            }
        };
        
        this.init();
    }

    init() {
        // Cargar firma del representante
        this.loadRepresentantSignature();
        
        // Configurar eventos
        document.getElementById('configRepBtn').addEventListener('click', () => {
            this.toggleRepConfig();
        });

        // Upload área para firma representante
        const uploadArea = document.getElementById('repUploadArea');
        const fileInput = document.getElementById('repSignatureFile');
        
        uploadArea.addEventListener('click', () => fileInput.click());
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.background = '#e0f2fe';
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.background = '';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.background = '';
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.handleRepSignatureFile(file);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.handleRepSignatureFile(e.target.files[0]);
            }
        });

        document.getElementById('saveRepBtn').addEventListener('click', () => {
            this.saveRepresentantSignature();
        });

        // File upload (PDF or Image) - Ahora soporta múltiples archivos
        document.getElementById('pdfFile').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleMultipleFiles(e.target.files);
            }
        });

        // Procesar todos los archivos
        document.getElementById('processAllBtn').addEventListener('click', () => {
            this.processAllFiles();
        });

        // Buscar firma
        document.getElementById('searchSignatureBtn').addEventListener('click', () => {
            this.searchSignature();
        });

        // Firmar PDF
        document.getElementById('signPdfBtn').addEventListener('click', () => {
            this.signPdf();
        });

        // Ver firmas registradas
        document.getElementById('viewSignaturesBtn').addEventListener('click', () => {
            this.showSignaturesList();
        });

        // Cerrar lista de firmas
        document.getElementById('closeSignaturesBtn').addEventListener('click', () => {
            document.getElementById('signaturesListSection').style.display = 'none';
        });

        // Sistema de búsqueda de firmas
        document.getElementById('searchBtn').addEventListener('click', () => {
            this.searchSignatures();
        });

        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchSignatures();
            }
        });

        // Actualizar estadísticas
        this.updateStats();
    }

    toggleRepConfig() {
        const config = document.getElementById('representantConfig');
        config.style.display = config.style.display === 'none' ? 'block' : 'none';
    }

    handleRepSignatureFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imgData = e.target.result;
            
            // Mostrar preview
            document.getElementById('repPreviewImg').src = imgData;
            document.getElementById('repSignaturePreview').style.display = 'block';
            document.getElementById('saveRepBtn').disabled = false;
            
            // Guardar temporalmente
            this.representantSignature = imgData;
        };
        reader.readAsDataURL(file);
    }

    saveRepresentantSignature() {
        if (this.representantSignature) {
            localStorage.setItem('representant_signature', this.representantSignature);
            alert('✅ Firma del representante guardada correctamente');
            this.loadRepresentantSignature();
            this.toggleRepConfig();
        }
    }

    loadRepresentantSignature() {
        const saved = localStorage.getItem('representant_signature');
        const currentDiv = document.getElementById('currentRepSignature');
        
        if (saved) {
            currentDiv.innerHTML = `
                <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; padding: 15px;">
                    <h4>Firma actual del representante:</h4>
                    <img src="${saved}" style="max-width: 250px; display: block; margin: 10px auto;">
                </div>
            `;
            this.representantSignature = saved;
        } else {
            currentDiv.innerHTML = `
                <div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; padding: 15px;">
                    <p style="color: #dc2626; margin: 0;">⚠️ No hay firma de representante configurada</p>
                </div>
            `;
        }
        
        this.updateStats();
    }

    handleMultipleFiles(files) {
        // Si solo es 1 archivo, usar el flujo normal
        if (files.length === 1) {
            this.processFile(files[0]);
            return;
        }

        // Limpiar cola anterior
        this.filesQueue = [];
        this.processedFiles = [];

        // Agregar archivos a la cola
        Array.from(files).forEach(file => {
            this.filesQueue.push({
                file: file,
                status: 'pending', // pending, processing, completed, error
                name: file.name,
                signature: null,
                pdfBytes: null,
                imageData: null
            });
        });

        // Mostrar cola
        this.displayFilesQueue();
        document.getElementById('filesQueueSection').style.display = 'block';
    }

    displayFilesQueue() {
        const queueContainer = document.getElementById('filesQueue');
        const queueCount = document.getElementById('queueCount');
        
        queueCount.textContent = this.filesQueue.length;
        queueContainer.innerHTML = '';

        this.filesQueue.forEach((item, index) => {
            const fileCard = document.createElement('div');
            fileCard.style.cssText = 'background: white; padding: 12px; border-radius: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;';
            
            let statusIcon = '⏳';
            let statusText = 'Pendiente';
            let statusColor = '#6b7280';
            
            if (item.status === 'processing') {
                statusIcon = '🔄';
                statusText = 'Procesando...';
                statusColor = '#3b82f6';
            } else if (item.status === 'completed') {
                statusIcon = '✅';
                statusText = 'Completado';
                statusColor = '#10b981';
            } else if (item.status === 'error') {
                statusIcon = '❌';
                statusText = 'Error';
                statusColor = '#ef4444';
            }
            
            fileCard.innerHTML = `
                <div style="flex: 1;">
                    <strong>${item.name}</strong>
                    ${item.signature ? `<br><small style="color: #666;">Firma: ${item.signature.fullName}</small>` : ''}
                </div>
                <div style="color: ${statusColor}; font-weight: bold;">
                    ${statusIcon} ${statusText}
                </div>
            `;
            
            queueContainer.appendChild(fileCard);
        });
    }

    async processAllFiles() {
        if (!this.representantSignature) {
            alert('⚠️ Configura la firma del representante primero');
            return;
        }

        const btn = document.getElementById('processAllBtn');
        btn.disabled = true;
        btn.textContent = '⏳ Procesando...';

        // Array para almacenar los PDFs firmados
        const signedPdfs = [];

        for (let i = 0; i < this.filesQueue.length; i++) {
            const item = this.filesQueue[i];
            
            if (item.status === 'completed') continue;

            item.status = 'processing';
            this.displayFilesQueue();

            try {
                // Procesar archivo (sin descargar)
                await this.processSingleFileInQueue(item, false); // false = no descargar individualmente
                
                item.status = 'completed';
                this.processedFiles.push(item);
                signedPdfs.push(item.signedPdfBytes); // Guardar PDF firmado
            } catch (error) {
                console.error('Error procesando archivo:', error);
                item.status = 'error';
                item.errorMessage = error.message;
            }

            this.displayFilesQueue();
        }

        btn.disabled = false;
        btn.textContent = '⚡ Procesar Todos los Archivos';
        
        const completed = this.filesQueue.filter(f => f.status === 'completed').length;
        const errors = this.filesQueue.filter(f => f.status === 'error').length;
        
        if (completed > 0) {
            // Combinar todos los PDFs en uno solo
            console.log(`📑 Combinando ${completed} PDFs en un solo archivo...`);
            try {
                const combinedPdf = await this.combinePdfs(signedPdfs);
                const today = new Date().toISOString().split('T')[0];
                this.downloadPdf(combinedPdf, `Constancias_Firmadas_${today}.pdf`);
                
                alert(`✅ Proceso completado!\n\n✓ ${completed} archivos firmados\n✓ Descargando PDF combinado\n${errors > 0 ? `\n✗ ${errors} archivos con error` : ''}`);
            } catch (error) {
                console.error('Error combinando PDFs:', error);
                alert(`⚠️ Archivos procesados pero hubo un error al combinarlos.\n\n✓ ${completed} firmados\n✗ ${errors} con error`);
            }
        } else {
            alert(`❌ No se pudo procesar ningún archivo.\n\n✗ ${errors} archivos con error`);
        }
    }

    async processSingleFileInQueue(item) {
        // Procesar el archivo (cargar y extraer datos)
        const arrayBuffer = await item.file.arrayBuffer();
        const header = new Uint8Array(arrayBuffer.slice(0, 5));
        const headerStr = String.fromCharCode(...header);

        // Si es imagen
        if (!headerStr.startsWith('%PDF')) {
            const blob = new Blob([arrayBuffer]);
            const imageUrl = URL.createObjectURL(blob);
            const img = new Image();
            
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imageUrl;
            });

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            item.imageData = canvas.toDataURL('image/png');
            URL.revokeObjectURL(imageUrl);
        } else {
            // Es PDF
            item.pdfBytes = new Uint8Array(arrayBuffer);
            
            // Renderizar primera página para OCR
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 2.0 });
            
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const context = canvas.getContext('2d');
            
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            item.imageData = canvas.toDataURL('image/png');
        }

        // OCR para extraer nombre/CURP
        console.log(`📄 Procesando: ${item.name}`);
        
        // ✅ MEJORA: Preprocesar imagen para mejor OCR
        const processedImage = await this.preprocessImageForOCR(item.imageData);
        
        const worker = await Tesseract.createWorker('spa', 1);
        const { data: { text } } = await worker.recognize(processedImage);
        await worker.terminate();

        // Buscar firma usando la misma lógica que autoSearchSignature
        const name = this.extractNameFromText(text);
        const doc = this.extractDocumentFromText(text);
        
        console.log(`🔍 Datos detectados en ${item.name}:`, { nombre: name, documento: doc });
        
        const signatures = await this.getAllSignatures();
        
        // Usar la misma búsqueda flexible que autoSearchSignature
        const found = signatures.find(sig => {
            const sigName = (sig.fullName || '').toLowerCase().trim();
            const sigDoc = (sig.document || '').toLowerCase().trim();
            const searchName = name.toLowerCase().trim();
            const searchDoc = doc.toLowerCase().trim();
            
            // Normalizar documentos
            const sigDocNorm = this.normalizeDocument(sigDoc);
            const searchDocNorm = this.normalizeDocument(searchDoc);
            
            // PRIORIDAD 1: Buscar por NOMBRE
            if (searchName && sigName) {
                // Coincidencia exacta
                if (sigName === searchName) {
                    console.log(`✅ Coincidencia por nombre para ${item.name}`);
                    return true;
                }
                
                // Coincidencia parcial por palabras
                const searchWords = searchName.split(/\s+/).filter(w => w.length > 2);
                const sigWords = sigName.split(/\s+/).filter(w => w.length > 2);
                
                const matchCount = searchWords.filter(word => 
                    sigWords.some(sigWord => sigWord.includes(word) || word.includes(sigWord))
                ).length;
                
                if (matchCount >= 2) {
                    console.log(`✅ Coincidencia por nombre (${matchCount} palabras) para ${item.name}`);
                    return true;
                }
            }
            
            // PRIORIDAD 2: Buscar por CURP/RFC
            if (searchDocNorm && sigDocNorm) {
                if (sigDocNorm === searchDocNorm) {
                    console.log(`✅ Coincidencia por CURP para ${item.name}`);
                    return true;
                }
                if (sigDocNorm.includes(searchDocNorm) || searchDocNorm.includes(sigDocNorm)) {
                    console.log(`✅ Coincidencia parcial por CURP para ${item.name}`);
                    return true;
                }
            }
            
            return false;
        });

        if (!found) {
            console.error(`❌ No se encontró firma para ${item.name}`);
            throw new Error(`Firma no encontrada: ${name || doc || 'sin datos detectados'}`);
        }

        console.log(`✅ Firma encontrada para ${item.name}:`, found.fullName);
        item.signature = found;

        // Firmar PDF
        const signedPdf = await this.signPdfForQueue(item);
        
        // Guardar bytes del PDF firmado
        item.signedPdfBytes = signedPdf;
        
        // Descargar solo si se pasa el parámetro (para procesamiento individual)
        if (arguments[1] !== false) {
            this.downloadPdf(signedPdf, found.fullName);
        }
    }

    extractNameFromText(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        console.log('📄 Total líneas detectadas:', lines.length);
        console.log('🎯 Buscando nombre después de "CONSTANCIA DE CAPACITACIÓN"...');
        
        // ESTRATEGIA 1: Buscar la línea después de encontrar "CONSTANCIA"
        let foundConstancia = false;
        let skipCount = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Detectar cuando pasamos la sección de "CONSTANCIA"
            if (line.includes('CONSTANCIA') || line.includes('CAPACITACIÓN')) {
                foundConstancia = true;
                skipCount = 0;
                continue;
            }
            
            // Si ya pasamos "CONSTANCIA", buscar las siguientes líneas
            if (foundConstancia) {
                skipCount++;
                
                // Saltar primeras 1-3 líneas (puede haber "A" o texto extra)
                if (skipCount <= 3) continue;
                
                // Buscar nombre en MAYÚSCULAS (3-5 palabras, 20-50 caracteres)
                if (/^[A-ZÁÉÍÓÚÑ]+(\s+[A-ZÁÉÍÓÚÑ]+){2,4}$/.test(line) && 
                    line.length >= 20 && line.length <= 50 &&
                    !line.includes('FEDERAL') &&
                    !line.includes('TRANSPORTE') &&
                    !line.includes('DENOMINADO') &&
                    !line.includes('REGISTRO') &&
                    !line.includes('FOLIO') &&
                    !line.includes('CONTROL') &&
                    !line.includes('EXTIENDE')) {
                    console.log('✅ Nombre encontrado después de CONSTANCIA (línea', i, '):', line);
                    return line;
                }
                
                // Si ya avanzamos mucho, dejamos de buscar
                if (skipCount > 15) break;
            }
        }
        
        console.log('⚠️ Estrategia 1 falló, intentando estrategia 2...');
        
        // ESTRATEGIA 2: Buscar la línea más larga en MAYÚSCULAS (suele ser el nombre)
        let longestName = '';
        let longestLength = 0;
        
        for (const line of lines) {
            if (/^[A-ZÁÉÍÓÚÑ]+(\s+[A-ZÁÉÍÓÚÑ]+){2,4}$/.test(line) && 
                line.length >= 20 && line.length <= 50 &&
                !line.includes('CAPACITACIÓN') &&
                !line.includes('ADIESTRAMIENTO') &&
                !line.includes('CONDUCTORES') &&
                !line.includes('FEDERAL') &&
                !line.includes('TRANSPORTE') &&
                !line.includes('CENTRO')) {
                if (line.length > longestLength) {
                    longestLength = line.length;
                    longestName = line;
                }
            }
        }
        
        if (longestName) {
            console.log('✅ Nombre detectado (línea más larga):', longestName);
            return longestName;
        }
        
        console.log('❌ No se pudo detectar el nombre');
        return '';
    }

    // Normalizar CURP corrigiendo errores comunes del OCR según estructura oficial
    normalizeDocument(doc) {
        if (!doc) return '';
        
        // Convertir a mayúsculas y quitar espacios
        let normalized = doc.toUpperCase().replace(/\s+/g, '');
        
        // Estructura oficial de CURP (18 caracteres):
        // Pos 0-3:   LETRAS (apellido paterno, materno, nombre)
        // Pos 4-9:   NÚMEROS (fecha: AAMMDD - 6 dígitos)
        // Pos 10:    LETRA (sexo: H o M)
        // Pos 11-12: LETRAS (estado de nacimiento)
        // Pos 13-15: LETRAS (consonantes internas)
        // Pos 16-17: NÚMEROS si nació antes del 2000, LETRA+NÚMERO si nació después
        
        if (normalized.length === 18) {
            const chars = normalized.split('');
            
            // Posiciones 4-9: DEBEN ser números (fecha nacimiento AAMMDD)
            for (let i = 4; i < 10; i++) {
                if (chars[i] === 'O') chars[i] = '0';
                if (chars[i] === 'I' || chars[i] === 'l') chars[i] = '1';
                if (chars[i] === 'S') chars[i] = '5';
                if (chars[i] === 'Z') chars[i] = '2';
                if (chars[i] === 'B') chars[i] = '8';
            }
            
            // Posición 10: DEBE ser letra (H o M)
            if (chars[10] === '0') chars[10] = 'O';
            if (chars[10] === '1') chars[10] = 'I';
            
            // Posiciones 11-15: DEBEN ser letras (estado y consonantes)
            for (let i = 11; i < 16; i++) {
                if (chars[i] === '0') chars[i] = 'O';
                if (chars[i] === '1') chars[i] = 'I';
                if (chars[i] === '5') chars[i] = 'S';
                if (chars[i] === '8') chars[i] = 'B';
            }
            
            // Determinar si nació antes del 2000 según el año (pos 4-5)
            const yearStr = chars[4] + chars[5];
            const year = parseInt(yearStr);
            const bornBefore2000 = year >= 20 && year <= 99; // 20-99 = 1920-1999
            
            if (bornBefore2000) {
                // Posiciones 16-17: AMBAS deben ser números (nacidos antes del 2000)
                if (chars[16] === 'O') chars[16] = '0';
                if (chars[16] === 'I' || chars[16] === 'l') chars[16] = '1';
                if (chars[16] === 'S') chars[16] = '5';
                if (chars[16] === 'Z') chars[16] = '2';
                if (chars[16] === 'B') chars[16] = '8';
                
                if (chars[17] === 'O') chars[17] = '0';
                if (chars[17] === 'I' || chars[17] === 'l') chars[17] = '1';
                if (chars[17] === 'S') chars[17] = '5';
                if (chars[17] === 'Z') chars[17] = '2';
                if (chars[17] === 'B') chars[17] = '8';
            } else {
                // Posición 16: LETRA (nacidos del 2000 en adelante)
                if (chars[16] === '0') chars[16] = 'O';
                if (chars[16] === '1') chars[16] = 'I';
                if (chars[16] === '5') chars[16] = 'S';
                if (chars[16] === '8') chars[16] = 'B';
                
                // Posición 17: NÚMERO
                if (chars[17] === 'O') chars[17] = '0';
                if (chars[17] === 'I' || chars[17] === 'l') chars[17] = '1';
                if (chars[17] === 'S') chars[17] = '5';
                if (chars[17] === 'Z') chars[17] = '2';
                if (chars[17] === 'B') chars[17] = '8';
            }
            
            // Posiciones 0-3: DEBEN ser letras (apellidos y nombre)
            for (let i = 0; i < 4; i++) {
                if (chars[i] === '0') chars[i] = 'O';
                if (chars[i] === '1') chars[i] = 'I';
                if (chars[i] === '5') chars[i] = 'S';
                if (chars[i] === '8') chars[i] = 'B';
            }
            
            normalized = chars.join('');
            console.log('🔧 CURP normalizado (año:', yearStr, bornBefore2000 ? '< 2000' : '>= 2000', ')');
        }
        
        return normalized;
    }
    
    extractDocumentFromText(text) {
        const lines = text.split('\n').map(l => l.trim());
        
        console.log('🎯 Buscando CURP después de la palabra clave "CON CURP"...');
        
        // ESTRATEGIA 1: Buscar después de "CON CURP" o "CURP:"
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Si encontramos "CON CURP" o similar
            if (line.includes('CON CURP') || line.includes('CURP:') || line.includes('CURP :')) {
                console.log('📍 Encontrado "CON CURP" en línea', i, ':', line);
                
                // La CURP puede estar en la misma línea o en las siguientes
                // Buscar en esta línea y las próximas 3
                for (let j = i; j < Math.min(i + 4, lines.length); j++) {
                    const searchLine = lines[j];
                    const curpRegex = /[A-Z0-9]{4}[A-Z0-9OIlSZB]{6}[HM0-9][A-Z0-9]{5}[A-Z0-9OIl]{2}/gi;
                    const matches = searchLine.match(curpRegex);
                    
                    if (matches) {
                        for (const match of matches) {
                            if (match.length === 18) {
                                const normalized = this.normalizeDocument(match);
                                console.log('✅ CURP encontrado después de "CON CURP":', match);
                                console.log('🔧 CURP normalizado:', normalized);
                                return normalized;
                            }
                        }
                    }
                }
            }
        }
        
        console.log('⚠️ No encontrado después de "CON CURP", buscando en todo el documento...');
        
        // ESTRATEGIA 2: Buscar CURP en todo el documento
        const curpRegex = /[A-Z0-9]{4}[A-Z0-9OIlSZB]{6}[HM0-9][A-Z0-9]{5}[A-Z0-9OIl]{2}/gi;
        const matches = text.match(curpRegex);
        
        if (matches) {
            for (const match of matches) {
                if (match.length === 18) {
                    const normalized = this.normalizeDocument(match);
                    console.log('📋 CURP detectado:', match);
                    console.log('✅ CURP normalizado:', normalized);
                    return normalized;
                }
            }
        }

        // ESTRATEGIA 3: Buscar RFC (13 caracteres)
        const rfcRegex = /[A-Z&Ñ]{3,4}[A-Z0-9OI]{6}[A-Z0-9]{3}/gi;
        const rfcMatch = text.match(rfcRegex);
        if (rfcMatch && rfcMatch[0].length === 13) {
            console.log('📋 RFC detectado:', rfcMatch[0]);
            return rfcMatch[0].toUpperCase().replace(/\s+/g, '');
        }

        console.log('❌ No se detectó CURP ni RFC en el documento');
        return '';
    }

    async signPdfForQueue(item) {
        const pdfDoc = await PDFLib.PDFDocument.create();
        
        let page, pageWidth, pageHeight;
        
        if (item.imageData) {
            // Crear desde imagen
            let backgroundImage;
            if (item.imageData.includes('data:image/png')) {
                const imgBytes = this.dataURLToArrayBuffer(item.imageData);
                backgroundImage = await pdfDoc.embedPng(imgBytes);
            } else {
                const imgBytes = this.dataURLToArrayBuffer(item.imageData);
                backgroundImage = await pdfDoc.embedJpg(imgBytes);
            }
            
            pageWidth = backgroundImage.width;
            pageHeight = backgroundImage.height;
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            page.drawImage(backgroundImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });
        }

        // Embedear firmas
        const userSigImage = await this.embedImage(pdfDoc, item.signature.signature);
        const repSigImage = await this.embedImage(pdfDoc, this.representantSignature);

        // Usar coordenadas unificadas desde this.COORDENADAS
        page.drawImage(userSigImage, {
            x: this.COORDENADAS.usuario.x,
            y: pageHeight - this.COORDENADAS.usuario.y - this.COORDENADAS.usuario.alto,
            width: this.COORDENADAS.usuario.ancho,
            height: this.COORDENADAS.usuario.alto,
        });

        page.drawImage(repSigImage, {
            x: this.COORDENADAS.representante.x,
            y: pageHeight - this.COORDENADAS.representante.y - this.COORDENADAS.representante.alto,
            width: this.COORDENADAS.representante.ancho,
            height: this.COORDENADAS.representante.alto,
        });

        return await pdfDoc.save();
    }

    async showSignaturesList() {
        const signatures = await this.getAllSignatures();
        const listContainer = document.getElementById('signaturesList');
        const noSignaturesMsg = document.getElementById('noSignaturesMessage');
        const section = document.getElementById('signaturesListSection');

        section.style.display = 'block';

        if (signatures.length === 0) {
            listContainer.style.display = 'none';
            noSignaturesMsg.style.display = 'block';
            return;
        }

        listContainer.style.display = 'grid';
        noSignaturesMsg.style.display = 'none';

        // Limpiar lista
        listContainer.innerHTML = '';

        // Crear tarjeta para cada firma
        signatures.forEach((sig, index) => {
            const card = document.createElement('div');
            card.style.cssText = 'border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; background: white; display: grid; grid-template-columns: auto 1fr auto; gap: 15px; align-items: center;';
            
            card.innerHTML = `
                <div style="width: 150px; height: 80px; border: 2px solid #ddd; border-radius: 4px; padding: 5px; background: white; display: flex; align-items: center; justify-content: center;">
                    <img src="${sig.signature}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
                </div>
                <div>
                    <h4 style="margin: 0 0 8px 0; color: #1f2937;">${sig.fullName}</h4>
                    <p style="margin: 0; color: #6b7280; font-size: 0.9rem;">
                        <strong>CURP/RFC:</strong> ${sig.document}
                    </p>
                    <p style="margin: 5px 0 0 0; color: #9ca3af; font-size: 0.85rem;">
                        📅 ${new Date(sig.timestamp).toLocaleString('es-MX')}
                    </p>
                </div>
                <button class="btn-delete-signature" data-id="${sig.id}" data-name="${sig.fullName}" style="background: #ef4444; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; transition: background 0.2s;">
                    🗑️ Eliminar
                </button>
            `;
            
            // Agregar evento de eliminación
            const deleteBtn = card.querySelector('.btn-delete-signature');
            deleteBtn.addEventListener('mouseover', () => deleteBtn.style.background = '#dc2626');
            deleteBtn.addEventListener('mouseout', () => deleteBtn.style.background = '#ef4444');
            deleteBtn.addEventListener('click', () => this.deleteSignature(sig.id, sig.fullName));
            
            listContainer.appendChild(card);
        });
    }

    deleteSignature(signatureId, signatureName) {
        // Confirmar eliminación
        if (!confirm(`¿Estás seguro de eliminar la firma de:\n\n${signatureName}?\n\nEsta acción no se puede deshacer.`)) {
            return;
        }

        try {
            // Eliminar del array de firmas
            let signatures = JSON.parse(localStorage.getItem('signatures') || '[]');
            signatures = signatures.filter(sig => sig.id !== signatureId);
            localStorage.setItem('signatures', JSON.stringify(signatures));

            // También eliminar si existe en formato antiguo
            localStorage.removeItem(`signature_${signatureId}`);

            // Actualizar la interfaz
            this.showSignaturesList();
            this.updateStats();

            alert(`✅ Firma de ${signatureName} eliminada correctamente`);
        } catch (error) {
            console.error('Error al eliminar firma:', error);
            alert('❌ Error al eliminar la firma. Por favor intenta de nuevo.');
        }
    }

    async processFile(file) {
        // Mostrar sección de escaneo
        document.getElementById('scanningSection').style.display = 'block';
        document.getElementById('personDataSection').style.display = 'none';
        document.getElementById('signatureFound').style.display = 'none';
        document.getElementById('noSignature').style.display = 'none';
        
        // Detectar si es PDF o imagen
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            await this.processPDF(file);
        } else if (file.type.startsWith('image/')) {
            await this.processImage(file);
        } else {
            alert('⚠️ Formato de archivo no soportado. Usa PDF o imagen (JPG, PNG).');
            document.getElementById('scanningSection').style.display = 'none';
        }
    }
    
    async processPDF(file) {
        this.currentPdfFile = file;
        
        try {
            this.updateProgress(5, 'Cargando archivo...');
            
            const arrayBuffer = await file.arrayBuffer();
            
            // Verificar que sea PDF válido
            const header = new Uint8Array(arrayBuffer.slice(0, 5));
            const headerStr = String.fromCharCode(...header);
            
            // Si no es PDF válido, intentar como imagen
            if (!headerStr.startsWith('%PDF')) {
                console.log('⚠️ No es un PDF válido, procesando como imagen...');
                this.updateProgress(10, 'Detectado como imagen. Creando PDF...');
                
                // Crear un blob de la imagen
                const blob = new Blob([arrayBuffer]);
                const imageUrl = URL.createObjectURL(blob);
                
                // Convertir a data URL para OCR
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () => reject(new Error('No se pudo cargar como imagen'));
                    img.src = imageUrl;
                });
                
                // Crear canvas y dibujar la imagen
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                const imageData = canvas.toDataURL('image/png');
                
                // Guardar la imagen original para usarla en el overlay
                this.currentImageData = imageData;
                this.currentPdfBytes = null; // No tenemos PDF original
                
                URL.revokeObjectURL(imageUrl);
                
                this.updateProgress(20, 'Imagen guardada. Iniciando OCR...');
                
                // Procesar con OCR
                await this.scanImageWithOCR(imageData);
                return;
            }
            
            // Es un PDF válido
            this.currentPdfBytes = new Uint8Array(arrayBuffer);
            this.currentImageData = null; // Limpiar imagen previa
            
            this.updateProgress(10, 'PDF válido. Convirtiendo primera página a imagen...');
            
            // Usar PDF.js para renderizar el PDF
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            this.updateProgress(30, 'PDF cargado. Renderizando página...');
            
            // Obtener primera página
            const page = await pdf.getPage(1);
            
            // Configurar canvas
            const scale = 2.0; // Escala alta para mejor OCR
            const viewport = page.getViewport({ scale });
            
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const context = canvas.getContext('2d');
            
            this.updateProgress(50, 'Dibujando página en canvas...');
            
            // Renderizar PDF en canvas
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
            this.updateProgress(60, 'Página renderizada. Iniciando OCR...');
            
            // Convertir canvas a imagen y guardarla también
            const imageData = canvas.toDataURL('image/png');
            this.currentImageData = imageData; // Guardar para overlay
            
            // Realizar OCR
            await this.scanImageWithOCR(imageData);
            
        } catch (error) {
            console.error('Error procesando archivo:', error);
            
            // Mensaje más claro
            let errorMsg = '❌ Error al procesar el archivo:\n\n';
            
            if (error.message.includes('No se pudo cargar como imagen')) {
                errorMsg += 'El archivo no es un PDF válido ni una imagen reconocible.\n\n';
                errorMsg += '💡 Solución: Convierte el documento a imagen (JPG/PNG) o PDF válido.';
            } else {
                errorMsg += error.message;
            }
            
            errorMsg += '\n\nPuedes ingresar los datos manualmente.';
            
            alert(errorMsg);
            document.getElementById('scanningSection').style.display = 'none';
            document.getElementById('personDataSection').style.display = 'block';
        }
    }
    
    async processImage(file) {
        try {
            this.updateProgress(5, 'Cargando imagen...');
            
            const imageData = await this.readFileAsDataURL(file);
            
            // Guardar la imagen para usarla en el overlay
            this.currentImageData = imageData;
            this.currentPdfBytes = null;
            
            this.updateProgress(10, 'Imagen cargada. Iniciando OCR...');
            
            await this.scanImageWithOCR(imageData);
            
        } catch (error) {
            console.error('Error procesando imagen:', error);
            alert('❌ Error al procesar la imagen: ' + error.message);
            document.getElementById('scanningSection').style.display = 'none';
        }
    }
    
    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Preprocesar imagen para mejorar OCR: aumentar contraste y eliminar sombras
    preprocessImageForOCR(imageData) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                
                // Dibujar imagen original
                ctx.drawImage(img, 0, 0);
                
                // Obtener datos de píxeles
                const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageDataObj.data;
                
                // Aumentar contraste drásticamente y convertir a escala de grises
                const contrastFactor = 2.5; // Factor de contraste alto
                const brightnessOffset = -30; // Reducir brillo para eliminar fondos claros
                
                for (let i = 0; i < data.length; i += 4) {
                    // Convertir a escala de grises
                    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                    
                    // Aplicar contraste y brillo
                    let adjusted = ((gray - 128) * contrastFactor) + 128 + brightnessOffset;
                    
                    // Binarizar: si es muy claro, blanco puro; si es oscuro, negro puro
                    adjusted = adjusted > 180 ? 255 : adjusted < 80 ? 0 : adjusted;
                    
                    // Asignar valor ajustado
                    data[i] = data[i + 1] = data[i + 2] = adjusted;
                }
                
                ctx.putImageData(imageDataObj, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.src = imageData;
        });
    }
    
    async scanImageWithOCR(imageData) {
        try {
            // Verificar que Tesseract esté cargado
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract.js no se ha cargado. Por favor recarga la página.');
            }
            
            // Actualizar progreso
            this.updateProgress(10, 'Imagen cargada...');
            this.updateProgress(15, 'Mejorando contraste de imagen...');
            
            // ✅ MEJORA: Preprocesar imagen para mejor OCR
            const processedImage = await this.preprocessImageForOCR(imageData);
            
            this.updateProgress(20, 'Iniciando OCR (esto puede tardar 30-60 segundos)...');
            
            // Realizar OCR con imagen preprocesada
            const worker = await Tesseract.createWorker('spa', 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = 20 + (m.progress * 65);
                        this.updateProgress(progress, `Extrayendo texto: ${Math.round(m.progress * 100)}%`);
                    }
                }
            });
            
            const { data: { text } } = await worker.recognize(processedImage);
            await worker.terminate();
            
            this.updateProgress(90, 'Texto extraído. Analizando datos...');
            
            // Guardar texto extraído
            this.extractedText = text;
            
            // Intentar extraer nombre y CURP automáticamente
            this.autoFillData(text);
            
            this.updateProgress(95, 'Buscando firma en la base de datos...');
            
            // Buscar firma automáticamente
            await this.autoSearchSignature();
            
            this.updateProgress(100, '✅ Proceso completado');
            
            // Mostrar sección de datos después de 1 segundo
            setTimeout(() => {
                document.getElementById('scanningSection').style.display = 'none';
                document.getElementById('personDataSection').style.display = 'block';
            }, 1000);
            
        } catch (error) {
            console.error('Error en OCR:', error);
            
            let errorMsg = '❌ Error al escanear la imagen:\n\n' + (error.message || 'Error desconocido');
            errorMsg += '\n\nPuedes ingresar los datos manualmente.';
            
            alert(errorMsg);
            
            document.getElementById('scanningSection').style.display = 'none';
            document.getElementById('personDataSection').style.display = 'block';
        }
    }
    
    async autoSearchSignature() {
        // Intentar buscar automáticamente con los datos llenados
        const name = document.getElementById('personName').value.trim();
        const doc = document.getElementById('personDoc').value.trim();
        
        if (!name && !doc) {
            console.log('⚠️ No se detectaron datos, no se puede buscar firma automáticamente');
            return;
        }
        
        // Buscar firmas
        const signatures = await this.getAllSignatures();
        
        console.log('🔍 BÚSQUEDA AUTOMÁTICA DE FIRMA');
        console.log('📝 Nombre detectado:', name || 'no detectado');
        console.log('📝 CURP/RFC detectado:', doc || 'no detectado');
        console.log('📊 Total firmas disponibles:', signatures.length);
        
        // Búsqueda PRIORIDAD 1: Por NOMBRE (más fácil de detectar en OCR)
        // PRIORIDAD 2: Por CURP/RFC (confirmación adicional)
        const found = signatures.find(sig => {
            const sigName = (sig.fullName || '').toLowerCase().trim();
            const sigDoc = (sig.document || '').toLowerCase().trim();
            const searchName = name.toLowerCase().trim();
            const searchDoc = doc.toLowerCase().trim();
            
            // Normalizar documentos para comparación (corregir O→0, I→1)
            const sigDocNorm = this.normalizeDocument(sigDoc);
            const searchDocNorm = this.normalizeDocument(searchDoc);
            
            console.log('🔎 Comparando con firma:', {
                'Nombre guardado': sigName,
                'Nombre detectado': searchName,
                'CURP guardada': sigDoc + ' → ' + sigDocNorm,
                'CURP detectada': searchDoc + ' → ' + searchDocNorm
            });
            
            // PRIORIDAD 1: Buscar por NOMBRE (el texto grande es más confiable)
            if (searchName && sigName) {
                // Coincidencia exacta
                if (sigName === searchName) {
                    console.log('✅ ¡COINCIDENCIA EXACTA POR NOMBRE!');
                    return true;
                }
                
                // Coincidencia parcial por palabras (apellidos pueden estar en orden diferente)
                const searchWords = searchName.split(/\s+/).filter(w => w.length > 2);
                const sigWords = sigName.split(/\s+/).filter(w => w.length > 2);
                
                const matchCount = searchWords.filter(word => 
                    sigWords.some(sigWord => sigWord.includes(word) || word.includes(sigWord))
                ).length;
                
                // Si coinciden al menos 2 palabras significativas
                if (matchCount >= 2) {
                    console.log('✅ ¡COINCIDENCIA POR NOMBRE! (', matchCount, 'palabras)');
                    return true;
                }
            }
            
            // PRIORIDAD 2: Buscar por CURP/RFC (confirmación adicional)
            if (searchDocNorm && sigDocNorm) {
                if (sigDocNorm === searchDocNorm) {
                    console.log('✅ ¡COINCIDENCIA EXACTA POR CURP/RFC!');
                    return true;
                }
                if (sigDocNorm.includes(searchDocNorm) || searchDocNorm.includes(sigDocNorm)) {
                    console.log('✅ ¡COINCIDENCIA PARCIAL POR CURP/RFC!');
                    return true;
                }
            }
            
            return false;
        });

        if (found) {
            this.currentSignature = found;
            document.getElementById('foundSignature').src = found.signature;
            document.getElementById('foundName').textContent = `${found.fullName} - ${found.document}`;
            document.getElementById('signatureFound').style.display = 'block';
            document.getElementById('noSignature').style.display = 'none';
            console.log('✅ Firma encontrada automáticamente:', found);
        } else {
            document.getElementById('signatureFound').style.display = 'none';
            document.getElementById('noSignature').style.display = 'block';
            console.log('❌ No se encontró firma automáticamente');
        }
    }
    
    async scanPdfWithOCR(arrayBuffer) {
        try {
            // Verificar que las librerías estén cargadas
            if (typeof PDFLib === 'undefined') {
                throw new Error('PDF-Lib no se ha cargado. Por favor recarga la página.');
            }
            
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract.js no se ha cargado. Por favor recarga la página.');
            }
            
            // Actualizar progreso
            this.updateProgress(10, 'Cargando PDF con PDF-Lib...');
            
            // Cargar el PDF con pdf-lib
            const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            this.updateProgress(30, 'PDF cargado. Convirtiendo a imagen...');
            
            // Obtener la primera página
            const pages = pdfDoc.getPages();
            if (pages.length === 0) {
                throw new Error('El PDF no tiene páginas');
            }
            
            const firstPage = pages[0];
            const { width, height } = firstPage.getSize();
            
            // Crear un nuevo PDF con solo la primera página para renderizar
            const singlePagePdf = await PDFLib.PDFDocument.create();
            const [copiedPage] = await singlePagePdf.copyPages(pdfDoc, [0]);
            singlePagePdf.addPage(copiedPage);
            const pdfBytes = await singlePagePdf.save();
            
            this.updateProgress(40, 'Convirtiendo PDF a imagen...');
            
            // Crear un blob y URL para el PDF
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            // Crear un iframe oculto para cargar el PDF
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            
            // Esperar a que cargue y capturar como canvas
            await new Promise((resolve, reject) => {
                iframe.onload = resolve;
                iframe.onerror = reject;
                iframe.src = url;
            });
            
            // Crear canvas para OCR
            const canvas = document.createElement('canvas');
            const scale = 2;
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            
            // Fondo blanco
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            this.updateProgress(50, 'Imagen generada. Iniciando OCR...');
            
            // Convertir canvas a imagen
            const imageData = canvas.toDataURL('image/png');
            
            // Limpiar
            document.body.removeChild(iframe);
            URL.revokeObjectURL(url);
            
            // Realizar OCR con Tesseract.js
            this.updateProgress(60, 'Extrayendo texto con OCR (esto puede tardar 30-60 segundos)...');
            
            const worker = await Tesseract.createWorker('spa', 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = 60 + (m.progress * 30);
                        this.updateProgress(progress, `OCR en progreso: ${Math.round(m.progress * 100)}%`);
                    }
                }
            });
            
            const { data: { text } } = await worker.recognize(imageData);
            await worker.terminate();
            
            this.updateProgress(95, 'Analizando texto extraído...');
            
            // Guardar texto extraído
            this.extractedText = text;
            
            // Intentar extraer nombre y CURP automáticamente
            this.autoFillData(text);
            
            this.updateProgress(100, '✅ Escaneo completado');
            
            // Mostrar sección de datos después de 1 segundo
            setTimeout(() => {
                document.getElementById('scanningSection').style.display = 'none';
                document.getElementById('personDataSection').style.display = 'block';
            }, 1000);
            
        } catch (error) {
            console.error('Error en OCR:', error);
            
            // Mensaje de error más detallado
            let errorMsg = '❌ Error al escanear el PDF:\n\n';
            
            if (error.message.includes('no se ha cargado')) {
                errorMsg += error.message + '\n\nAsegúrate de tener conexión a Internet para cargar las librerías.';
            } else if (error.name === 'InvalidPDFException') {
                errorMsg += 'El archivo no es un PDF válido o está corrupto.';
            } else {
                errorMsg += error.message || 'Error desconocido';
            }
            
            errorMsg += '\n\nPuedes ingresar los datos manualmente.';
            
            alert(errorMsg);
            
            // Mostrar sección para ingreso manual
            document.getElementById('scanningSection').style.display = 'none';
            document.getElementById('personDataSection').style.display = 'block';
        }
    }

    updateProgress(percent, message) {
        document.getElementById('scanProgress').style.width = percent + '%';
        document.getElementById('scanStatus').textContent = message;
    }

    autoFillData(text) {
        console.log('📄 Extrayendo datos del documento...');
        
        // PRIORIDAD 1: Buscar CURP/RFC usando la función extractDocumentFromText
        const doc = this.extractDocumentFromText(text);
        if (doc) {
            document.getElementById('personDoc').value = doc;
            console.log('✅ CURP/RFC detectado:', doc);
        } else {
            console.log('⚠️ No se detectó CURP/RFC en el documento');
        }
        
        // OPCIONAL: Intentar detectar nombre (solo como referencia)
        const name = this.extractNameFromText(text);
        if (name) {
            document.getElementById('personName').value = name;
            console.log('✅ Nombre detectado:', name);
        } else {
            console.log('⚠️ No se detectó nombre (no es crítico si hay CURP)');
        }
        
        // Resumen
        if (doc) {
            console.log('💡 Con CURP/RFC es suficiente para buscar la firma');
        } else {
            console.log('❌ Sin CURP/RFC no se podrá buscar automáticamente');
        }
    }

    async searchSignature() {
        const name = document.getElementById('personName').value.trim();
        const doc = document.getElementById('personDoc').value.trim();

        if (!name && !doc) {
            alert('⚠️ Ingresa al menos el nombre o CURP/RFC');
            return;
        }

        // Buscar firmas
        const signatures = await this.getAllSignatures();
        
        console.log('Buscando firma para:', { name, doc });
        console.log('Firmas disponibles:', signatures.map(s => ({ 
            name: s.fullName, 
            doc: s.document 
        })));
        
        // Búsqueda más flexible
        const found = signatures.find(sig => {
            // Normalizar textos para comparación
            const sigName = (sig.fullName || '').toLowerCase().trim();
            const sigDoc = (sig.document || '').toLowerCase().trim();
            const searchName = name.toLowerCase().trim();
            const searchDoc = doc.toLowerCase().trim();
            
            // Búsqueda por documento (exacta o contenida)
            if (searchDoc && sigDoc) {
                if (sigDoc === searchDoc || sigDoc.includes(searchDoc) || searchDoc.includes(sigDoc)) {
                    console.log('✓ Coincidencia por documento:', sig.document);
                    return true;
                }
            }
            
            // Búsqueda por nombre (flexible)
            if (searchName && sigName) {
                // Dividir nombres en palabras
                const searchWords = searchName.split(/\s+/);
                const sigWords = sigName.split(/\s+/);
                
                // Si todas las palabras de búsqueda están en el nombre guardado
                const allWordsMatch = searchWords.every(word => 
                    sigWords.some(sigWord => sigWord.includes(word) || word.includes(sigWord))
                );
                
                if (allWordsMatch) {
                    console.log('✓ Coincidencia por nombre:', sig.fullName);
                    return true;
                }
            }
            
            return false;
        });

        if (found) {
            this.currentSignature = found;
            document.getElementById('foundSignature').src = found.signature;
            document.getElementById('foundName').textContent = `${found.fullName} - ${found.document}`;
            document.getElementById('signatureFound').style.display = 'block';
            document.getElementById('noSignature').style.display = 'none';
            console.log('✅ Firma encontrada:', found);
        } else {
            document.getElementById('signatureFound').style.display = 'none';
            document.getElementById('noSignature').style.display = 'block';
            console.log('❌ No se encontró firma');
        }
    }

    async getAllSignatures() {
        const signatures = [];
        
        if (CONFIG.USE_FIREBASE && db) {
            // Obtener de Firebase Firestore
            try {
                const snapshot = await db.collection('signatures').get();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    signatures.push(data);
                    console.log('📄 Firma en Firebase:', {
                        nombre: data.fullName,
                        documento: data.document,
                        id: data.id
                    });
                });
                console.log(`✅ Total firmas obtenidas de Firebase: ${signatures.length}`);
            } catch (e) {
                console.error('❌ Error obteniendo firmas de Firebase:', e);
            }
        } else {
            // localStorage (fallback)
            try {
                const storedSignatures = JSON.parse(localStorage.getItem('signatures') || '[]');
                if (Array.isArray(storedSignatures) && storedSignatures.length > 0) {
                    signatures.push(...storedSignatures);
                }
            } catch (e) {
                console.error('Error parsing signatures:', e);
            }
            
            // También buscar formato antiguo (signature_*)
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('signature_')) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
                        signatures.push(data);
                    } catch (e) {
                        console.error('Error parsing signature:', e);
                    }
                }
            }
            
            console.log(`Total de firmas en localStorage: ${signatures.length}`);
        }
        
        return signatures;
    }

    async signPdf() {
        if (!this.currentPdfBytes && !this.currentImageData) {
            alert('⚠️ Primero carga un documento');
            return;
        }

        if (!this.currentSignature) {
            alert('⚠️ Primero busca una firma');
            return;
        }

        if (!this.representantSignature) {
            alert('⚠️ Configura la firma del representante primero');
            return;
        }

        try {
            // Mostrar indicador de carga
            const btn = document.getElementById('signPdfBtn');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = '⏳ Creando PDF firmado...';

            // Crear un PDF nuevo limpio
            const pdfDoc = await PDFLib.PDFDocument.create();
            
            let backgroundImage, pageWidth, pageHeight;
            
            // Si tenemos imagen del documento, usarla como fondo
            if (this.currentImageData) {
                // Embedear la imagen del documento original
                if (this.currentImageData.includes('data:image/png')) {
                    const imgBytes = this.dataURLToArrayBuffer(this.currentImageData);
                    backgroundImage = await pdfDoc.embedPng(imgBytes);
                } else {
                    const imgBytes = this.dataURLToArrayBuffer(this.currentImageData);
                    backgroundImage = await pdfDoc.embedJpg(imgBytes);
                }
                
                pageWidth = backgroundImage.width;
                pageHeight = backgroundImage.height;
            } else if (this.currentPdfBytes) {
                // Intentar cargar el PDF existente
                try {
                    const existingPdf = await PDFLib.PDFDocument.load(this.currentPdfBytes);
                    const pages = existingPdf.getPages();
                    pageWidth = pages[0].getWidth();
                    pageHeight = pages[0].getHeight();
                    
                    // Copiar la primera página
                    const [copiedPage] = await pdfDoc.copyPages(existingPdf, [0]);
                    pdfDoc.addPage(copiedPage);
                } catch (e) {
                    alert('⚠️ No se pudo procesar el PDF. Por favor vuelve a cargar el documento.');
                    btn.disabled = false;
                    btn.textContent = originalText;
                    return;
                }
            }

            // Crear la página (solo si usamos imagen de fondo)
            let page;
            if (backgroundImage) {
                page = pdfDoc.addPage([pageWidth, pageHeight]);
                
                // Dibujar la imagen de fondo primero (CAPA 1: Documento original)
                page.drawImage(backgroundImage, {
                    x: 0,
                    y: 0,
                    width: pageWidth,
                    height: pageHeight,
                });
            } else {
                // Ya copiamos la página, obtenerla
                page = pdfDoc.getPages()[0];
                pageHeight = page.getHeight();
            }

            // Embedear las firmas (CAPA 2: Firmas encima)
            const userSigImage = await this.embedImage(pdfDoc, this.currentSignature.signature);
            const repSigImage = await this.embedImage(pdfDoc, this.representantSignature);

            // ===== USAR COORDENADAS UNIFICADAS =====
            // Las coordenadas están definidas en this.COORDENADAS (constructor)
            // Para modificarlas, edita el constructor de la clase
            
            // Dibujar firma del usuario
            page.drawImage(userSigImage, {
                x: this.COORDENADAS.usuario.x,
                y: pageHeight - this.COORDENADAS.usuario.y - this.COORDENADAS.usuario.alto,
                width: this.COORDENADAS.usuario.ancho,
                height: this.COORDENADAS.usuario.alto,
            });

            // Dibujar firma del representante
            page.drawImage(repSigImage, {
                x: this.COORDENADAS.representante.x,
                y: pageHeight - this.COORDENADAS.representante.y - this.COORDENADAS.representante.alto,
                width: this.COORDENADAS.representante.ancho,
                height: this.COORDENADAS.representante.alto,
            });

            // Guardar el PDF final
            const pdfBytes = await pdfDoc.save();
            
            // Descargar el PDF
            this.downloadPdf(pdfBytes, this.currentSignature.fullName);

            // Restaurar botón
            btn.disabled = false;
            btn.textContent = originalText;

            alert('✅ ¡PDF firmado exitosamente!');

        } catch (error) {
            console.error('Error al firmar PDF:', error);
            alert('❌ Error al firmar el PDF: ' + error.message);
            document.getElementById('signPdfBtn').disabled = false;
        }
    }

    async embedImage(pdfDoc, base64Image) {
        // Determinar el tipo de imagen
        if (base64Image.startsWith('data:image/png')) {
            const pngData = base64Image.split(',')[1];
            const pngBytes = this.base64ToArrayBuffer(pngData);
            return await pdfDoc.embedPng(pngBytes);
        } else {
            const jpgData = base64Image.split(',')[1];
            const jpgBytes = this.base64ToArrayBuffer(jpgData);
            return await pdfDoc.embedJpg(jpgBytes);
        }
    }

    base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }
    
    dataURLToArrayBuffer(dataURL) {
        const base64 = dataURL.split(',')[1];
        return this.base64ToArrayBuffer(base64);
    }

    async combinePdfs(pdfBytesArray) {
        // Crear un nuevo PDF que contendrá todas las páginas
        const combinedPdf = await PDFLib.PDFDocument.create();
        
        console.log(`📑 Combinando ${pdfBytesArray.length} PDFs...`);
        
        for (let i = 0; i < pdfBytesArray.length; i++) {
            try {
                const pdfBytes = pdfBytesArray[i];
                
                // Cargar el PDF individual
                const pdf = await PDFLib.PDFDocument.load(pdfBytes);
                
                // Copiar todas las páginas del PDF al PDF combinado
                const pages = await combinedPdf.copyPages(pdf, pdf.getPageIndices());
                
                // Agregar cada página al PDF combinado
                pages.forEach(page => {
                    combinedPdf.addPage(page);
                });
                
                console.log(`✅ PDF ${i + 1}/${pdfBytesArray.length} agregado (${pages.length} página(s))`);
            } catch (error) {
                console.error(`❌ Error agregando PDF ${i + 1}:`, error);
                // Continuar con los demás PDFs aunque uno falle
            }
        }
        
        // Generar el PDF combinado
        const combinedPdfBytes = await combinedPdf.save();
        console.log(`✅ PDF combinado generado: ${combinedPdfBytes.length} bytes`);
        
        return combinedPdfBytes;
    }
    
    downloadPdf(pdfBytes, personName) {
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Constancia_Firmada_${personName.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async updateStats() {
        const signatures = await this.getAllSignatures();
        document.getElementById('totalSignatures').textContent = signatures.length;
        
        const hasRep = localStorage.getItem('representant_signature');
        document.getElementById('repSignatureStatus').textContent = hasRep ? '✅' : '❌';
    }

    // Funciones para Google Sheets
    async searchSignatures() {
        const searchTerm = document.getElementById('searchInput').value.trim();
        
        if (!searchTerm || searchTerm.length < 3) {
            alert('⚠️ Ingresa al menos 3 caracteres para buscar');
            return;
        }

        const searchBtn = document.getElementById('searchBtn');
        searchBtn.disabled = true;
        searchBtn.textContent = '⏳ Buscando...';

        try {
            // Buscar en firmas (localStorage o Firebase)
            const signatures = await this.getAllSignatures();
            const searchLower = searchTerm.toLowerCase();
            const results = signatures.filter(sig => 
                sig.fullName.toLowerCase().includes(searchLower) ||
                sig.document.toLowerCase().includes(searchLower)
            );

            this.displaySearchResults(results);

        } catch (error) {
            console.error('Error en búsqueda:', error);
            alert('❌ Error al buscar firmas');
        } finally {
            searchBtn.disabled = false;
            searchBtn.textContent = '🔍 Buscar';
        }
    }

    displaySearchResults(results) {
        const resultsSection = document.getElementById('searchResults');
        const resultsList = document.getElementById('searchResultsList');

        if (results.length === 0) {
            resultsList.innerHTML = `
                <div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; padding: 20px; text-align: center;">
                    <h3 style="color: #dc2626;">❌ Sin resultados</h3>
                    <p>No se encontraron firmas con ese criterio de búsqueda.</p>
                </div>
            `;
        } else {
            resultsList.innerHTML = results.map(sig => `
                <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 10px; display: flex; align-items: center; gap: 15px;">
                    <img src="${sig.signature}" style="width: 120px; height: 60px; object-fit: contain; border: 1px solid #ddd; border-radius: 4px;">
                    <div style="flex: 1;">
                        <p style="margin: 0; font-weight: bold;">${sig.fullName}</p>
                        <p style="margin: 5px 0 0 0; color: #666; font-size: 0.9rem;">${sig.document}</p>
                        <p style="margin: 5px 0 0 0; color: #999; font-size: 0.85rem;">${new Date(sig.timestamp).toLocaleString('es-MX')}</p>
                    </div>
                    <button onclick="adminPDF.selectSignatureForSigning('${sig.id}')" class="btn btn-primary" style="white-space: nowrap;">
                        ✓ Usar esta firma
                    </button>
                    <button onclick="adminPDF.viewSignatureDetails('${sig.id}')" class="btn btn-secondary" style="white-space: nowrap;">
                        👁️ Ver detalles
                    </button>
                </div>
            `).join('');
        }

        resultsSection.style.display = 'block';
    }

    async selectSignatureForSigning(signatureId) {
        // Buscar la firma seleccionada
        // Buscar la firma por ID
        const signatures = await this.getAllSignatures();
        const signature = signatures.find(sig => sig.id === signatureId);

        if (signature) {
            // Rellenar los campos de persona
            document.getElementById('personName').value = signature.fullName;
            document.getElementById('personDoc').value = signature.document;
            
            // ✅ CORRECCIÓN: Guardar el objeto completo, no solo el string
            this.currentSignature = signature;  // Objeto completo con .signature, .fullName, etc.
            document.getElementById('foundSignature').src = signature.signature;
            document.getElementById('foundName').textContent = `${signature.fullName} - ${signature.document}`;
            document.getElementById('signatureFound').style.display = 'block';
            document.getElementById('noSignature').style.display = 'none';
            
            // Scroll hacia la sección de firmado
            document.querySelector('.card h2').scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            alert('✅ Firma seleccionada. Ahora puedes cargar un PDF para firmar.');
        }
    }

    async viewSignatureDetails(signatureId) {
        const signatures = await this.getAllSignatures();
        const signature = signatures.find(sig => sig.id === signatureId);
        
        if (signature) {
            const details = `
                Nombre: ${signature.fullName}
                CURP/RFC: ${signature.document}
                Fecha de registro: ${new Date(signature.timestamp).toLocaleString('es-MX')}
                ID: ${signature.id}
            `;
            alert(details);
        }
    }
}

// Inicializar cuando cargue la página y las librerías
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔄 Verificando librerías...');
    
    // Mostrar estado de carga en pantalla
    const statusDiv = document.createElement('div');
    statusDiv.id = 'libraryStatus';
    statusDiv.style.cssText = 'position: fixed; top: 10px; right: 10px; background: #3b82f6; color: white; padding: 10px 20px; border-radius: 8px; z-index: 9999; font-size: 14px;';
    statusDiv.textContent = '⏳ Cargando librerías...';
    document.body.appendChild(statusDiv);
    
    // Esperar a que las librerías se carguen
    const checkLibraries = setInterval(() => {
        const pdfLib = typeof PDFLib !== 'undefined';
        const tesseract = typeof Tesseract !== 'undefined';
        const pdfjs = typeof pdfjsLib !== 'undefined';
        
        console.log('Estado:', { PDFLib: pdfLib, Tesseract: tesseract, PDFjs: pdfjs });
        
        if (pdfLib && tesseract && pdfjs) {
            clearInterval(checkLibraries);
            console.log('✅ Todas las librerías cargadas correctamente');
            statusDiv.style.background = '#10b981';
            statusDiv.textContent = '✅ Sistema listo';
            setTimeout(() => statusDiv.remove(), 2000);
            window.adminPDF = new SimpleAdminPDF();
        }
    }, 100);
    
    // Timeout de 15 segundos
    setTimeout(() => {
        clearInterval(checkLibraries);
        const pdfLib = typeof PDFLib !== 'undefined';
        const tesseract = typeof Tesseract !== 'undefined';
        const pdfjs = typeof pdfjsLib !== 'undefined';
        
        if (!pdfLib || !tesseract || !pdfjs) {
            statusDiv.style.background = '#ef4444';
            statusDiv.textContent = '❌ Error al cargar';
            
            let errorMsg = '⚠️ Error al cargar las librerías:\n\n';
            if (!pdfLib) errorMsg += '❌ PDF-Lib no cargó\n';
            if (!tesseract) errorMsg += '❌ Tesseract no cargó\n';
            if (!pdfjs) errorMsg += '❌ PDF.js no cargó\n';
            errorMsg += '\n🌐 Verifica tu conexión a Internet y recarga la página (Ctrl+F5)';
            
            alert(errorMsg);
        }
    }, 15000);
});
