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

        for (let i = 0; i < this.filesQueue.length; i++) {
            const item = this.filesQueue[i];
            
            if (item.status === 'completed') continue;

            item.status = 'processing';
            this.displayFilesQueue();

            try {
                // Procesar archivo
                await this.processSingleFileInQueue(item);
                
                item.status = 'completed';
                this.processedFiles.push(item);
            } catch (error) {
                console.error('Error procesando archivo:', error);
                item.status = 'error';
            }

            this.displayFilesQueue();
        }

        btn.disabled = false;
        btn.textContent = '⚡ Procesar Todos los Archivos';
        
        const completed = this.filesQueue.filter(f => f.status === 'completed').length;
        const errors = this.filesQueue.filter(f => f.status === 'error').length;
        
        alert(`✅ Proceso completado!\n\n✓ ${completed} archivos firmados\n${errors > 0 ? `✗ ${errors} archivos con error` : ''}`);
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
        const worker = await Tesseract.createWorker('spa', 1);
        const { data: { text } } = await worker.recognize(item.imageData);
        await worker.terminate();

        // Buscar firma
        const name = this.extractNameFromText(text);
        const doc = this.extractDocumentFromText(text);
        
        const signatures = await this.getAllSignatures();
        const found = signatures.find(sig => {
            const sigDoc = (sig.document || '').toLowerCase().trim();
            const searchDoc = doc.toLowerCase().trim();
            return sigDoc && searchDoc && (sigDoc === searchDoc || sigDoc.includes(searchDoc));
        });

        if (!found) {
            throw new Error('Firma no encontrada para este documento');
        }

        item.signature = found;

        // Firmar PDF
        const signedPdf = await this.signPdfForQueue(item);
        
        // Descargar
        this.downloadPdf(signedPdf, found.fullName);
    }

    extractNameFromText(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        for (const line of lines) {
            if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}$/.test(line) && 
                line.length > 10 && line.length < 50) {
                return line;
            }
        }
        return '';
    }

    extractDocumentFromText(text) {
        const curpRegex = /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/g;
        const curpMatch = text.match(curpRegex);
        if (curpMatch) return curpMatch[0];

        const rfcRegex = /[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}/g;
        const rfcMatch = text.match(rfcRegex);
        if (rfcMatch) return rfcMatch[0];

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

        const COORDENADAS = {
            usuario: { x: 100, y: 150, ancho: 120, alto: 60 },
            representante: { x: 380, y: 150, ancho: 120, alto: 60 }
        };

        page.drawImage(userSigImage, {
            x: COORDENADAS.usuario.x,
            y: pageHeight - COORDENADAS.usuario.y - COORDENADAS.usuario.alto,
            width: COORDENADAS.usuario.ancho,
            height: COORDENADAS.usuario.alto,
        });

        page.drawImage(repSigImage, {
            x: COORDENADAS.representante.x,
            y: pageHeight - COORDENADAS.representante.y - COORDENADAS.representante.alto,
            width: COORDENADAS.representante.ancho,
            height: COORDENADAS.representante.alto,
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

    async scanImageWithOCR(imageData) {
        try {
            // Verificar que Tesseract esté cargado
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract.js no se ha cargado. Por favor recarga la página.');
            }
            
            // Actualizar progreso
            this.updateProgress(10, 'Imagen cargada...');
            this.updateProgress(20, 'Iniciando OCR (esto puede tardar 30-60 segundos)...');
            
            // Realizar OCR con Tesseract.js
            const worker = await Tesseract.createWorker('spa', 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = 20 + (m.progress * 65);
                        this.updateProgress(progress, `Extrayendo texto: ${Math.round(m.progress * 100)}%`);
                    }
                }
            });
            
            const { data: { text } } = await worker.recognize(imageData);
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
            console.log('No hay datos para buscar firma automáticamente');
            return;
        }
        
        // Buscar firmas
        const signatures = await this.getAllSignatures();
        
        console.log('Búsqueda automática de firma para:', { name, doc });
        
        // Búsqueda más flexible
        const found = signatures.find(sig => {
            const sigName = (sig.fullName || '').toLowerCase().trim();
            const sigDoc = (sig.document || '').toLowerCase().trim();
            const searchName = name.toLowerCase().trim();
            const searchDoc = doc.toLowerCase().trim();
            
            if (searchDoc && sigDoc) {
                if (sigDoc === searchDoc || sigDoc.includes(searchDoc) || searchDoc.includes(sigDoc)) {
                    return true;
                }
            }
            
            if (searchName && sigName) {
                const searchWords = searchName.split(/\s+/);
                const sigWords = sigName.split(/\s+/);
                const allWordsMatch = searchWords.every(word => 
                    sigWords.some(sigWord => sigWord.includes(word) || word.includes(sigWord))
                );
                if (allWordsMatch) {
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
        // Buscar CURP (18 caracteres alfanuméricos)
        const curpRegex = /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/g;
        const curpMatch = text.match(curpRegex);
        
        if (curpMatch && curpMatch[0]) {
            document.getElementById('personDoc').value = curpMatch[0];
        }
        
        // Buscar RFC (13 caracteres)
        const rfcRegex = /[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}/g;
        const rfcMatch = text.match(rfcRegex);
        
        if (!curpMatch && rfcMatch && rfcMatch[0]) {
            document.getElementById('personDoc').value = rfcMatch[0];
        }
        
        // Intentar detectar nombre (líneas con palabras capitalizadas)
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // Buscar patrones comunes de nombres
        const namePatterns = [
            /(?:nombre|name|titular|beneficiario)[\s:]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)/i,
            /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)$/,
        ];
        
        for (const line of lines) {
            for (const pattern of namePatterns) {
                const match = line.match(pattern);
                if (match && match[1]) {
                    document.getElementById('personName').value = match[1];
                    return;
                }
            }
        }
        
        // Si no encontramos patrón específico, buscar la línea más probable
        for (const line of lines) {
            // Línea con 2-4 palabras capitalizadas, longitud razonable
            if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}$/.test(line) && 
                line.length > 10 && line.length < 50) {
                document.getElementById('personName').value = line;
                return;
            }
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
        
        if (CONFIG.USE_FIREBASE) {
            // TODO: Obtener de Firebase (implementaremos después)
            console.log('Firebase no configurado aún, usando localStorage');
        }
        
        // localStorage (temporal hasta configurar Firebase)
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
        
        console.log(`Total de firmas: ${signatures.length}`);
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

            // ===== COORDENADAS FIJAS =====
            // Ajusta estas coordenadas según tu plantilla de documento
            const COORDENADAS = {
                usuario: {
                    x: 171,      // Posición horizontal desde la izquierda
                    y: 1150,      // Posición vertical desde abajo
                    ancho: 400,  // Ancho de la firma
                    alto: 200     // Alto de la firma
                },
                representante: {
                    x: 650,      // Posición horizontal desde la izquierda
                    y: 1130,      // Posición vertical desde abajo
                    ancho: 500,  // Ancho de la firma
                    alto: 200     // Alto de la firma
                }
            };

            // Dibujar firma del usuario
            page.drawImage(userSigImage, {
                x: COORDENADAS.usuario.x,
                y: pageHeight - COORDENADAS.usuario.y - COORDENADAS.usuario.alto,
                width: COORDENADAS.usuario.ancho,
                height: COORDENADAS.usuario.alto,
            });

            // Dibujar firma del representante
            page.drawImage(repSigImage, {
                x: COORDENADAS.representante.x,
                y: pageHeight - COORDENADAS.representante.y - COORDENADAS.representante.alto,
                width: COORDENADAS.representante.ancho,
                height: COORDENADAS.representante.alto,
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
            
            // Mostrar la firma encontrada
            this.currentSignature = signature.signature;
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
