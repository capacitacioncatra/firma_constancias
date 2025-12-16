// Inicializar Firebase
let db;
console.log('🔍 Verificando Firebase...');
console.log('CONFIG:', CONFIG);
console.log('USE_FIREBASE:', CONFIG.USE_FIREBASE);
console.log('firebase disponible:', typeof firebase !== 'undefined');

if (CONFIG.USE_FIREBASE && typeof firebase !== 'undefined') {
    try {
        firebase.initializeApp(CONFIG.firebase);
        db = firebase.firestore();
        console.log('✅ Firebase inicializado correctamente en admin');
        console.log('✅ Firestore disponible:', db);
    } catch (error) {
        console.error('❌ Error al inicializar Firebase:', error);
    }
} else {
    console.warn('⚠️ Firebase no está disponible o USE_FIREBASE está en false');
}

// Sistema de firmado de PDFs - Modo Local (sin servidor) con OCR
class SimpleAdminPDF {
    constructor() {
        this.currentPdfBytes = null;
        this.currentImageData = null; // Guardar imagen original para overlay
        this.currentSignature = null;
        this.representantSignature = null;
        this.filesQueue = []; // Cola de archivos para procesar
        this.processedFiles = []; // Archivos ya procesados
        this.selectedGestor = 'TODOS'; // Filtro por gestor
        this.constanciasMap = new Map(); // Mapa de constancias por nombre normalizado
        
        // COORDENADAS UNIFICADAS para todas las firmas (individual y por lotes)
        this.COORDENADAS = {
            usuario: {
                x: 130,      // Posición horizontal desde la izquierda
                y: 960,     // Posición vertical desde abajo
                ancho:250 ,  // Ancho de la firma
                alto: 150    // Alto de la firma
            },
            representante: {
                x: 500,      // Posición horizontal desde la izquierda
                y: 950,     // Posición vertical desde abajo
                ancho: 450,  // Ancho de la firma
                alto: 170    // Alto de la firma
            }
        };
        
        this.init();
    }

    init() {
        this.loadRepresentantSignature();
        this.loadStoredAttendanceList();
        document.getElementById('configRepBtn').addEventListener('click', () => {
            this.toggleRepConfig();
        });

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


        // Ver firmas registradas
        document.getElementById('viewSignaturesBtn').addEventListener('click', () => {
            // Limpiar filtros al abrir
            document.getElementById('searchInput').value = '';
            document.getElementById('signaturesDateFilter').value = '';
            document.getElementById('searchResults').style.display = 'none';
            this.showSignaturesList(false); // false = mostrar todas
        });

        // Ver firmas de hoy
        document.getElementById('viewTodaySignaturesBtn').addEventListener('click', () => {
            // Limpiar filtros y establecer fecha de hoy
            document.getElementById('searchInput').value = '';
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('signaturesDateFilter').value = today;
            document.getElementById('searchResults').style.display = 'none';
            this.showSignaturesList(false, today); // Mostrar con filtro de fecha
        });

        // Cerrar lista de firmas
        document.getElementById('closeSignaturesBtn').addEventListener('click', () => {
            document.getElementById('signaturesListSection').style.display = 'none';
        });

        // Sistema de búsqueda de firmas en el modal
        document.getElementById('searchBtn').addEventListener('click', () => {
            this.searchSignaturesInModal();
        });

        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchSignaturesInModal();
            }
        });

        // Filtro de fecha de firmas
        document.getElementById('signaturesDateFilter').addEventListener('change', (e) => {
            const selectedDate = e.target.value;
            document.getElementById('searchResults').style.display = 'none';
            if (selectedDate) {
                this.showSignaturesList(false, selectedDate);
            } else {
                this.showSignaturesList(false);
            }
        });

        // Limpiar filtros
        document.getElementById('clearFiltersBtn').addEventListener('click', () => {
            document.getElementById('searchInput').value = '';
            document.getElementById('signaturesDateFilter').value = '';
            document.getElementById('searchResults').style.display = 'none';
            this.showSignaturesList(false);
        });

        // Control de Asistencia - Selector de fecha
        const datePicker = document.getElementById('attendanceDatePicker');
        datePicker.value = new Date().toISOString().split('T')[0]; // Establecer hoy por defecto
        
        datePicker.addEventListener('change', async () => {
            const newDate = datePicker.value;
            console.log(`📅 Fecha cambiada a: ${newDate}`);
            
            // Si hay un workbook cargado, recargar automáticamente con la nueva fecha
            if (this.savedWorkbook) {
                console.log('📚 Recargando lista con nueva fecha desde Excel guardado...');
                this.selectedAttendanceDate = newDate;
                await this.reloadAttendanceFromWorkbook();
            } else if (this.attendanceList && this.attendanceList.length > 0) {
                // Si solo hay lista pero no workbook, actualizar fecha y estadísticas
                this.selectedAttendanceDate = newDate;
                this.attendanceDate = newDate;
                document.getElementById('loadedAttendanceDate').textContent = this.formatDisplayDate(newDate);
                await this.updateAttendanceInfo();
                console.log('📅 Fecha actualizada, pero sin Excel guardado para recargar datos');
            }
        });

        // Control de Asistencia - Cargar Excel
        document.getElementById('loadAttendanceBtn').addEventListener('click', () => {
            this.selectedAttendanceDate = datePicker.value;
            document.getElementById('attendanceExcelFile').click();
        });

        document.getElementById('attendanceExcelFile').addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.loadAttendanceList(e.target.files[0]);
                // Resetear el input para permitir cargar el mismo archivo de nuevo
                e.target.value = '';
            }
        });

        document.getElementById('viewAttendanceBtn').addEventListener('click', () => {
            this.showAttendanceCheck();
        });

        document.getElementById('closeAttendanceBtn').addEventListener('click', () => {
            document.getElementById('attendanceCheckSection').style.display = 'none';
        });

        document.getElementById('filterAllBtn').addEventListener('click', () => {
            this.showAttendanceCheck(false);
        });

        document.getElementById('filterMissingBtn').addEventListener('click', () => {
            this.showAttendanceCheck(true);
        });

        // Cargar constancias (botón en tabla de cotejo)
        document.getElementById('loadConstanciasBtnInline').addEventListener('click', () => {
            console.log('🖱️ Click en loadConstanciasBtnInline');
            const fileInput = document.getElementById('constanciasFiles');
            fileInput.click();
        });

        document.getElementById('constanciasFiles').addEventListener('change', (e) => {
            console.log('📝 Change event en constanciasFiles');
            console.log('📎 Archivos seleccionados:', e.target.files.length);
            if (e.target.files.length > 0) {
                this.loadConstancias(Array.from(e.target.files));
                // Resetear el input para permitir cargar los mismos archivos de nuevo
                e.target.value = '';
            }
        });

        // Imprimir por gestor
        document.getElementById('printGestorBtn').addEventListener('click', () => {
            this.printByGestor();
        });

        // Exportar faltantes por gestor
        document.getElementById('exportMissingBtn').addEventListener('click', () => {
            this.exportMissingSignatures();
        });

        // Actualizar estadísticas
        this.updateStats();
    }

    toggleRepConfig() {
        const config = document.getElementById('representantConfig');
        const isVisible = config.style.display !== 'none';
        
        if (isVisible) {
            // Cerrar
            config.style.display = 'none';
        } else {
            // Abrir y limpiar formulario
            config.style.display = 'block';
            
            // Limpiar preview y input
            document.getElementById('repSignaturePreview').style.display = 'none';
            document.getElementById('saveRepBtn').disabled = true;
            const fileInput = document.getElementById('repSignatureFile');
            fileInput.value = '';
        }
    }

    handleRepSignatureFile(file) {
        console.log('📁 Archivo seleccionado:', file.name, 'Tamaño:', (file.size / 1024).toFixed(2), 'KB');
        
        // Verificar tamaño (máximo 2MB)
        if (file.size > 2 * 1024 * 1024) {
            alert('⚠️ La imagen es muy grande. El tamaño máximo es 2MB.\nPor favor, reduce el tamaño de la imagen.');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const imgData = e.target.result;
            
            // Verificar tamaño de la cadena base64 (Firestore tiene límite de ~1MB)
            const sizeInKB = (imgData.length * 3 / 4) / 1024;
            console.log('📊 Tamaño de imagen en base64:', sizeInKB.toFixed(2), 'KB');
            
            if (sizeInKB > 900) {
                alert('⚠️ La imagen codificada es muy grande para Firestore (>900KB).\nPor favor, usa una imagen más pequeña o de menor resolución.');
                return;
            }
            
            // Mostrar preview
            document.getElementById('repPreviewImg').src = imgData;
            document.getElementById('repSignaturePreview').style.display = 'block';
            document.getElementById('saveRepBtn').disabled = false;
            
            // Guardar temporalmente
            this.representantSignature = imgData;
        };
        reader.readAsDataURL(file);
    }

    async saveRepresentantSignature() {
        if (!this.representantSignature) {
            alert('⚠️ No hay firma para guardar');
            return;
        }
        
        try {
            console.log('🔄 Iniciando guardado de firma del representante...');
            console.log('📊 CONFIG.USE_FIREBASE:', CONFIG.USE_FIREBASE);
            console.log('📊 db disponible:', !!db);
            console.log('📊 Tamaño de firma:', (this.representantSignature.length / 1024).toFixed(2), 'KB');
            
            let savedInFirestore = false;
            
            // Intentar guardar en Firestore si está disponible
            if (CONFIG.USE_FIREBASE && db) {
                try {
                    console.log('📤 Guardando en Firestore...');
                    await db.collection('config').doc('representant_signature').set({
                        signature: this.representantSignature,
                        timestamp: new Date().toISOString(),
                        updatedBy: 'admin'
                    });
                    console.log('✅ Firma del representante guardada en Firestore');
                    savedInFirestore = true;
                } catch (firestoreError) {
                    console.error('❌ Error guardando en Firestore:', firestoreError.message);
                    console.warn('⚠️ Continuando con localStorage...');
                }
            } else {
                console.warn('⚠️ Firebase no está disponible, usando solo localStorage');
            }
            
            // Siempre guardar en localStorage (respaldo o principal)
            localStorage.setItem('representant_signature', this.representantSignature);
            console.log('✅ Firma guardada en localStorage');
            
            const message = savedInFirestore 
                ? '✅ Firma guardada correctamente en Firebase y localStorage' 
                : '✅ Firma guardada correctamente en localStorage (modo local)';
            
            alert(message);
                
                // Limpiar el input de archivo para poder seleccionar de nuevo
                const fileInput = document.getElementById('repSignatureFile');
                fileInput.value = '';
                
                // Ocultar preview
                document.getElementById('repSignaturePreview').style.display = 'none';
                document.getElementById('saveRepBtn').disabled = true;
                
                this.loadRepresentantSignature();
                this.toggleRepConfig();
        } catch (error) {
            console.error('❌ Error guardando firma del representante:', error);
            console.error('Tipo de error:', error.name);
            console.error('Mensaje de error:', error.message);
            console.error('Stack:', error.stack);
            
            let errorMessage = '❌ Error al guardar la firma:\n\n';
            
            if (error.code === 'permission-denied') {
                errorMessage += 'Permisos de Firestore denegados.\nVerifica las reglas de seguridad en Firebase Console.';
            } else if (error.message.includes('quota')) {
                errorMessage += 'Se excedió la cuota de Firestore.\nLa imagen puede ser muy grande.';
            } else if (error.message.includes('network')) {
                errorMessage += 'Error de conexión a internet.\nVerifica tu conexión e intenta de nuevo.';
            } else {
                errorMessage += error.message || 'Error desconocido';
            }
            
            alert(errorMessage);
        }
    }

    async loadRepresentantSignature() {
        const currentDiv = document.getElementById('currentRepSignature');
        let saved = null;
        
        try {
            // Intentar cargar desde Firestore primero
            if (CONFIG.USE_FIREBASE && db) {
                const doc = await db.collection('config').doc('representant_signature').get();
                if (doc.exists) {
                    saved = doc.data().signature;
                    console.log('✅ Firma del representante cargada desde Firestore');
                    // Guardar también en localStorage como caché
                    localStorage.setItem('representant_signature', saved);
                }
            }
            
            // Si no hay en Firestore, intentar localStorage
            if (!saved) {
                saved = localStorage.getItem('representant_signature');
                if (saved) {
                    console.log('⚠️ Firma cargada desde localStorage (respaldo local)');
                }
            }
        } catch (error) {
            console.error('Error cargando firma del representante:', error);
            // Fallback a localStorage
            saved = localStorage.getItem('representant_signature');
        }
        
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
                statusText = 'Listo';
                statusColor = '#10b981';
            } else if (item.status === 'skipped') {
                statusIcon = '⏭️';
                statusText = 'Impresa';
                statusColor = '#f59e0b';
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

    clearFilesQueue() {
        if (this.filesQueue.length === 0) {
            return;
        }

        const hasProcessed = this.filesQueue.some(f => f.status === 'completed' || f.status === 'error' || f.status === 'skipped');
        
        if (hasProcessed) {
            // Si ya hay archivos procesados, limpiar directamente
            this.filesQueue = [];
            this.processedFiles = [];
            this.displayFilesQueue();
            
            // Ocultar la sección de cola
            document.getElementById('filesQueueSection').style.display = 'none';
            
            // Limpiar el input de archivos para poder seleccionar los mismos archivos de nuevo
            const fileInput = document.getElementById('pdfFile');
            fileInput.value = '';
            
            console.log('✅ Cola de archivos limpiada');
        } else {
            // Si no hay archivos procesados, confirmar
            if (confirm('¿Estás seguro de que deseas limpiar la cola?\n\nSe eliminarán todos los archivos sin procesar.')) {
                this.filesQueue = [];
                this.processedFiles = [];
                this.displayFilesQueue();
                document.getElementById('filesQueueSection').style.display = 'none';
                
                const fileInput = document.getElementById('pdfFile');
                fileInput.value = '';
                
                console.log('✅ Cola de archivos limpiada');
            }
        }
    }

    async processAllFiles() {
        if (!this.representantSignature) {
            alert('⚠️ Configura la firma del representante primero');
            return;
        }

        const btn = document.getElementById('processAllBtn');
        btn.disabled = true;
        btn.textContent = '⏳ Procesando...';

        // Array para almacenar los PDFs firmados y los IDs procesados
        const signedPdfs = [];
        const processedSignatureIds = [];

        for (let i = 0; i < this.filesQueue.length; i++) {
            const item = this.filesQueue[i];
            
            if (item.status === 'completed') continue;

            item.status = 'processing';
            this.displayFilesQueue();

            try {
                console.log(`\n📋 === Procesando archivo ${i + 1}/${this.filesQueue.length}: ${item.name} ===`);
                
                // Procesar archivo (sin descargar)
                await this.processSingleFileInQueue(item, false); // false = no descargar individualmente
                
                if (!item.signedPdfBytes) {
                    console.error(`❌ ERROR: ${item.name} no tiene signedPdfBytes después del procesamiento`);
                    throw new Error('No se generó el PDF firmado');
                }
                
                console.log(`✅ ${item.name} procesado correctamente (${item.signedPdfBytes.length} bytes)`);
                
                item.status = 'completed';
                this.processedFiles.push(item);
                signedPdfs.push(item.signedPdfBytes); // Guardar PDF firmado
                
                // Guardar ID de la firma para marcar como impresa después
                if (item.signature && item.signature.id) {
                    processedSignatureIds.push(item.signature.id);
                }
            } catch (error) {
                console.error(`❌ Error procesando archivo ${item.name}:`, error);
                
                // Si ya está impresa, marcar como "skipped" en lugar de "error"
                if (error.message && error.message.includes('Ya impresa')) {
                    item.status = 'skipped';
                    item.errorMessage = 'Ya impresa - saltada';
                } else {
                    item.status = 'error';
                    item.errorMessage = error.message;
                }
            }

            this.displayFilesQueue();
        }

        btn.disabled = false;
        btn.textContent = '⚡ Procesar Todos los Archivos';
        
        const completed = this.filesQueue.filter(f => f.status === 'completed').length;
        const skipped = this.filesQueue.filter(f => f.status === 'skipped').length;
        const errors = this.filesQueue.filter(f => f.status === 'error').length;
        
        if (completed > 0) {
            // Combinar todos los PDFs en uno solo
            console.log(`📑 Combinando ${completed} PDFs en un solo archivo...`);
            try {
                const combinedPdf = await this.combinePdfs(signedPdfs);
                const today = new Date().toISOString().split('T')[0];
                this.downloadPdf(combinedPdf, `Constancias_Firmadas_${today}.pdf`);
                
                // Marcar todas las firmas procesadas como impresas
                for (const signatureId of processedSignatureIds) {
                    await this.markAsPrinted(signatureId);
                }
                
                alert(`✅ Proceso completado!\n\n✓ ${completed} archivos firmados\n✓ ${processedSignatureIds.length} constancias marcadas como impresas\n✓ Descargando PDF combinado${skipped > 0 ? `\n⏭️ ${skipped} ya impresas (saltadas)` : ''}${errors > 0 ? `\n✗ ${errors} archivos con error` : ''}`);
            } catch (error) {
                console.error('Error combinando PDFs:', error);
                alert(`⚠️ Archivos procesados pero hubo un error al combinarlos.\n\n✓ ${completed} firmados${skipped > 0 ? `\n⏭️ ${skipped} ya impresas` : ''}\n✗ ${errors} con error`);
            }
        } else if (skipped > 0 && completed === 0 && errors === 0) {
            alert(`⏭️ Todas las constancias ya fueron impresas.\n\n⏭️ ${skipped} constancias saltadas\n\nSi deseas reimprimir, desmarca la casilla "Constancia Impresa" en el control de asistencia.`);
        } else {
            alert(`❌ No se pudo procesar ningún archivo.\n\n${skipped > 0 ? `⏭️ ${skipped} ya impresas\n` : ''}✗ ${errors} archivos con error`);
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
        
        // ✅ MEJORAS: Preprocesar con OTSU, escala de grises y reducción de ruido
        const processedImage = await this.preprocessImageForOCR(item.imageData);
        
        // ✅ MEJORAS 3, 8: Configurar Tesseract para lotes también
        const worker = await Tesseract.createWorker('spa', 1);
        await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
            load_system_dawg: '0',
            load_freq_dawg: '0',
            load_unambig_dawg: '0',
            load_punc_dawg: '0',
            load_number_dawg: '0',
            load_fixedlength_dawg: '0',
            load_bigram_dawg: '0',
            wordrec_enable_assoc: '0',
            language_model_penalty_non_dict_word: '0',
            language_model_penalty_non_freq_dict_word: '0'
        });
        
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

        // Verificar si ya está marcada como impresa para ESTE curso
        const courseDate = this.attendanceDate || new Date().toISOString().split('T')[0];
        const printedCourses = found.printedCourses || [];
        
        if (printedCourses.includes(courseDate)) {
            console.log(`⏭️ Saltando ${item.name} - constancia ya impresa para curso del ${courseDate}`);
            throw new Error(`Ya impresa para curso ${courseDate} - saltando: ${found.fullName}`);
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
                
                // ✅ MEJORA 9: Filtros más robustos para nombre
                // 3-5 palabras, todas mayúsculas, sin palabras prohibidas
                const wordCount = line.split(/\s+/).length;
                const forbiddenWords = [
                    'FEDERAL', 'TRANSPORTE', 'DENOMINADO', 'REGISTRO', 'FOLIO',
                    'CONTROL', 'EXTIENDE', 'PRESENTE', 'CONDUCTORES', 'CAPACITACIÓN',
                    'ADIESTRAMIENTO', 'CENTRO', 'SERVICIO', 'AUTOTRANSPORTE',
                    'PRIVADO', 'GENERAL', 'NACIONAL', 'CARGA', 'PERIODO',
                    'DURACIÓN', 'HORAS', 'PROGRAMA', 'INTEGRAL', 'LICENCIA'
                ];
                
                const hasForbiddenWord = forbiddenWords.some(word => line.includes(word));
                
                if (/^[A-ZÁÉÍÓÚÑ]+(\s+[A-ZÁÉÍÓÚÑ]+){2,4}$/.test(line) && 
                    wordCount >= 3 && wordCount <= 5 &&
                    line.length >= 20 && line.length <= 60 &&
                    !hasForbiddenWord) {
                    console.log('✅ Nombre encontrado después de CONSTANCIA (línea', i, '):', line);
                    return line;
                }
                
                // Si ya avanzamos mucho, dejamos de buscar
                if (skipCount > 15) break;
            }
        }
        
        console.log('⚠️ Estrategia 1 falló, intentando estrategia 2...');
        
        // ✅ MEJORA 9: ESTRATEGIA 2 mejorada con filtros robustos
        const forbiddenWords = [
            'CAPACITACIÓN', 'ADIESTRAMIENTO', 'CONDUCTORES', 'FEDERAL',
            'TRANSPORTE', 'CENTRO', 'CONSTANCIA', 'SERVICIO', 'AUTOTRANSPORTE',
            'DENOMINADO', 'REGISTRO', 'PRESENTE', 'EXTIENDE'
        ];
        
        let longestName = '';
        let longestLength = 0;
        
        for (const line of lines) {
            const wordCount = line.split(/\s+/).length;
            const hasForbiddenWord = forbiddenWords.some(word => line.includes(word));
            
            if (/^[A-ZÁÉÍÓÚÑ]+(\s+[A-ZÁÉÍÓÚÑ]+){2,4}$/.test(line) && 
                wordCount >= 3 && wordCount <= 5 &&
                line.length >= 20 && line.length <= 60 &&
                !hasForbiddenWord) {
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
        console.log(`🖊️ Iniciando firmado para: ${item.name}`);
        console.log(`  - Tiene firma usuario:`, !!item.signature);
        console.log(`  - Tiene firma representante:`, !!this.representantSignature);
        
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
            console.log(`  ✅ Página creada: ${pageWidth}x${pageHeight}`);
        }

        // Embedear firmas
        console.log(`  🖼️ Embebiendo firmas...`);
        const userSigImage = await this.embedImage(pdfDoc, item.signature.signature);
        const repSigImage = await this.embedImage(pdfDoc, this.representantSignature);
        console.log(`  ✅ Firmas embebidas`);

        // ✅ COORDENADAS PROPORCIONALES AL TAMAÑO DE LA IMAGEN
        // Si la imagen es más grande que el tamaño base (ancho 1000px), escalar coordenadas
        const BASE_WIDTH = 1000; // Ancho de referencia para las coordenadas originales
        const scale = pageWidth / BASE_WIDTH;
        
        console.log(`  📐 Escala calculada: ${scale.toFixed(2)}x (página ${pageWidth}px, base ${BASE_WIDTH}px)`);

        // Calcular posiciones proporcionales
        const userPos = {
            x: this.COORDENADAS.usuario.x * scale,
            y: pageHeight - (this.COORDENADAS.usuario.y * scale) - (this.COORDENADAS.usuario.alto * scale),
            width: this.COORDENADAS.usuario.ancho * scale,
            height: this.COORDENADAS.usuario.alto * scale,
        };
        
        const repPos = {
            x: this.COORDENADAS.representante.x * scale,
            y: pageHeight - (this.COORDENADAS.representante.y * scale) - (this.COORDENADAS.representante.alto * scale),
            width: this.COORDENADAS.representante.ancho * scale,
            height: this.COORDENADAS.representante.alto * scale,
        };
        
        console.log(`  📍 Posición usuario (escalada):`, userPos);
        console.log(`  📍 Posición representante (escalada):`, repPos);

        // Dibujar firmas en la página
        console.log(`  🎨 Dibujando firma usuario...`);
        page.drawImage(userSigImage, userPos);
        console.log(`  ✅ Firma usuario dibujada`);
        
        console.log(`  🎨 Dibujando firma representante...`);
        page.drawImage(repSigImage, repPos);
        console.log(`  ✅ Firma representante dibujada`);

        const pdfBytes = await pdfDoc.save();
        console.log(`  ✅ PDF guardado: ${pdfBytes.length} bytes`);
        
        return pdfBytes;
    }

    async showSignaturesList(todayOnly = false, filterDate = null) {
        const allSignatures = await this.getAllSignatures();
        let signatures = allSignatures;
        
        // Filtrar por fecha específica si se proporciona
        if (filterDate) {
            const targetDate = this.getLocalDateFromString(filterDate);
            
            signatures = allSignatures.filter(sig => {
                if (!sig.timestamp) return false;
                const sigDate = this.getDateWithoutTime(sig.timestamp);
                return sigDate.getTime() === targetDate.getTime();
            });
        }
        // Filtrar solo las de hoy si se solicita
        else if (todayOnly) {
            const today = this.getDateWithoutTime(new Date());
            
            signatures = allSignatures.filter(sig => {
                if (!sig.timestamp) return false;
                const sigDate = this.getDateWithoutTime(sig.timestamp);
                return sigDate.getTime() === today.getTime();
            });
        }
        
        const listContainer = document.getElementById('signaturesList');
        const noSignaturesMsg = document.getElementById('noSignaturesMessage');
        const section = document.getElementById('signaturesListSection');
        const counter = document.getElementById('signaturesCounter');
        const counterText = document.getElementById('signaturesCountText');

        section.style.display = 'block';
        
        // Actualizar título según el filtro
        const titleElement = section.querySelector('h3');
        if (titleElement) {
            if (filterDate) {
                const dateObj = new Date(filterDate);
                const dateStr = dateObj.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                titleElement.textContent = `Firmas del ${dateStr}`;
            } else {
                const today = new Date();
                const dateStr = today.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                titleElement.textContent = todayOnly 
                    ? `Firmas Registradas Hoy (${dateStr})` 
                    : 'Todas las Firmas Registradas';
            }
        }

        // Mostrar contador
        if (signatures.length > 0) {
            counter.style.display = 'block';
            counterText.textContent = `${signatures.length} firma${signatures.length !== 1 ? 's' : ''}`;
        } else {
            counter.style.display = 'none';
        }

        if (signatures.length === 0) {
            listContainer.style.display = 'none';
            noSignaturesMsg.style.display = 'block';
            const msgText = noSignaturesMsg.querySelector('p:first-child');
            if (filterDate) {
                msgText.textContent = 'No hay firmas para esta fecha';
            } else {
                msgText.textContent = todayOnly ? 'No hay firmas registradas hoy' : 'No hay firmas registradas';
            }
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
                <div style="display: flex; gap: 8px;">
                    <button class="btn-edit-signature" data-id="${sig.id}" style="background: #3b82f6; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; transition: background 0.2s;">
                        ✏️ Editar
                    </button>
                    <button class="btn-delete-signature" data-id="${sig.id}" data-name="${sig.fullName}" style="background: #ef4444; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; transition: background 0.2s;">
                        🗑️ Eliminar
                    </button>
                </div>
            `;
            
            // Agregar evento de edición
            const editBtn = card.querySelector('.btn-edit-signature');
            editBtn.addEventListener('mouseover', () => editBtn.style.background = '#2563eb');
            editBtn.addEventListener('mouseout', () => editBtn.style.background = '#3b82f6');
            editBtn.addEventListener('click', () => this.editSignature(sig));
            
            // Agregar evento de eliminación
            const deleteBtn = card.querySelector('.btn-delete-signature');
            deleteBtn.addEventListener('mouseover', () => deleteBtn.style.background = '#dc2626');
            deleteBtn.addEventListener('mouseout', () => deleteBtn.style.background = '#ef4444');
            deleteBtn.addEventListener('click', () => this.deleteSignature(sig.id, sig.fullName));
            
            listContainer.appendChild(card);
        });
    }

    editSignature(signature) {
        // Guardar referencia a la firma actual
        this.currentEditingSignature = signature;
        
        // Mostrar modal
        const modal = document.getElementById('editSignatureModal');
        modal.style.display = 'flex';
        
        // Rellenar campos con datos actuales
        document.getElementById('editFullName').value = signature.fullName || '';
        document.getElementById('editDocument').value = signature.document || '';
        
        // Event listeners para botones del modal (solo una vez)
        const saveBtn = document.getElementById('saveEditBtn');
        const cancelBtn = document.getElementById('cancelEditBtn');
        
        // Clonar botones para eliminar event listeners anteriores
        const newSaveBtn = saveBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        // Agregar nuevos event listeners
        newSaveBtn.addEventListener('click', () => this.saveSignatureEdit());
        newCancelBtn.addEventListener('click', () => this.closeEditModal());
        
        // Cerrar modal con Escape
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeEditModal();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }

    closeEditModal() {
        const modal = document.getElementById('editSignatureModal');
        modal.style.display = 'none';
        this.currentEditingSignature = null;
    }

    async saveSignatureEdit() {
        const newFullName = document.getElementById('editFullName').value.trim();
        const newDocument = document.getElementById('editDocument').value.trim();
        
        // Validaciones
        if (!newFullName) {
            alert('⚠️ El nombre completo es obligatorio');
            return;
        }
        
        if (!newDocument) {
            alert('⚠️ El CURP/RFC es obligatorio');
            return;
        }
        
        try {
            console.log('💾 Guardando cambios en firma:', this.currentEditingSignature.id);
            
            // Normalizar datos (igual que en app.js)
            const normalizedFullName = newFullName
                .toUpperCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/\s+/g, ' ')
                .trim();
            
            const normalizedDocument = newDocument
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '');
            
            // Actualizar objeto de firma
            const updatedSignature = {
                ...this.currentEditingSignature,
                fullName: normalizedFullName,
                document: normalizedDocument,
                lastModified: Date.now()
            };
            
            // Actualizar en Firebase Firestore si está disponible
            if (CONFIG.USE_FIREBASE && db) {
                try {
                    await db.collection('signatures').doc(updatedSignature.id).update({
                        fullName: normalizedFullName,
                        document: normalizedDocument,
                        lastModified: Date.now()
                    });
                    console.log('✅ Firma actualizada en Firestore');
                } catch (firestoreError) {
                    console.error('❌ Error actualizando en Firestore:', firestoreError);
                    console.warn('⚠️ Continuando con actualización de localStorage...');
                }
            }
            
            // Actualizar en localStorage
            let signatures = JSON.parse(localStorage.getItem('signatures') || '[]');
            const index = signatures.findIndex(sig => sig.id === updatedSignature.id);
            
            if (index !== -1) {
                signatures[index] = updatedSignature;
                localStorage.setItem('signatures', JSON.stringify(signatures));
                console.log('✅ Firma actualizada en localStorage');
            }
            
            // Cerrar modal
            this.closeEditModal();
            
            // Actualizar interfaz
            await this.showSignaturesList();
            await this.updateStats();
            
            // Mensaje de éxito
            alert(`✅ Datos actualizados correctamente:\n\nNombre: ${normalizedFullName}\nCURP/RFC: ${normalizedDocument}`);
            
        } catch (error) {
            console.error('❌ Error al guardar cambios:', error);
            alert('❌ Error al guardar los cambios. Por favor intenta de nuevo.');
        }
    }

    async deleteSignature(signatureId, signatureName) {
        // Confirmar eliminación
        if (!confirm(`¿Estás seguro de eliminar la firma de:\n\n${signatureName}?\n\nEsta acción no se puede deshacer.`)) {
            return;
        }

        try {
            console.log('🗑️ Eliminando firma:', signatureId);
            
            // Eliminar de Firebase Firestore si está disponible
            if (CONFIG.USE_FIREBASE && db) {
                try {
                    await db.collection('signatures').doc(signatureId).delete();
                    console.log('✅ Firma eliminada de Firestore');
                } catch (firestoreError) {
                    console.error('❌ Error eliminando de Firestore:', firestoreError);
                    console.warn('⚠️ Continuando con eliminación de localStorage...');
                }
            }
            
            // Eliminar de localStorage
            let signatures = JSON.parse(localStorage.getItem('signatures') || '[]');
            signatures = signatures.filter(sig => sig.id !== signatureId);
            localStorage.setItem('signatures', JSON.stringify(signatures));

            // También eliminar si existe en formato antiguo
            localStorage.removeItem(`signature_${signatureId}`);

            console.log('✅ Firma eliminada de localStorage');

            // Actualizar la interfaz
            await this.showSignaturesList();
            await this.updateStats();
        } catch (error) {
            console.error('❌ Error al eliminar firma:', error);
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
            
            // Configurar canvas con escala muy alta para OCR óptimo
            const scale = 4.5; // ✅ MEJORA 1: Escala 4.5 para máxima nitidez
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
                
                // ✅ MEJORA 6: Convertir a escala de grises primero (correctamente)
                for (let i = 0; i < data.length; i += 4) {
                    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                    data[i] = data[i + 1] = data[i + 2] = gray;
                }
                
                // ✅ MEJORA 2: Binarización adaptativa tipo OTSU
                // Calcular umbral óptimo automáticamente
                const histogram = new Array(256).fill(0);
                for (let i = 0; i < data.length; i += 4) {
                    histogram[data[i]]++;
                }
                
                const total = canvas.width * canvas.height;
                let sum = 0;
                for (let i = 0; i < 256; i++) {
                    sum += i * histogram[i];
                }
                
                let sumB = 0;
                let wB = 0;
                let wF = 0;
                let maxVariance = 0;
                let threshold = 0;
                
                for (let i = 0; i < 256; i++) {
                    wB += histogram[i];
                    if (wB === 0) continue;
                    
                    wF = total - wB;
                    if (wF === 0) break;
                    
                    sumB += i * histogram[i];
                    const mB = sumB / wB;
                    const mF = (sum - sumB) / wF;
                    const variance = wB * wF * (mB - mF) * (mB - mF);
                    
                    if (variance > maxVariance) {
                        maxVariance = variance;
                        threshold = i;
                    }
                }
                
                console.log('🎯 Umbral OTSU calculado:', threshold);
                
                // ✅ MEJORA 7: Aplicar contraste alto antes de binarizar
                const contrastFactor = 3.0; // Contraste más fuerte
                for (let i = 0; i < data.length; i += 4) {
                    let gray = data[i];
                    // Aplicar contraste
                    gray = ((gray - 128) * contrastFactor) + 128;
                    gray = Math.max(0, Math.min(255, gray));
                    data[i] = data[i + 1] = data[i + 2] = gray;
                }
                
                // Aplicar binarización con umbral OTSU
                for (let i = 0; i < data.length; i += 4) {
                    const value = data[i] > threshold ? 255 : 0;
                    data[i] = data[i + 1] = data[i + 2] = value;
                }
                
                // ✅ MEJORA 7: Reducción de ruido (eliminar puntos aislados)
                const tempData = new Uint8ClampedArray(data);
                for (let y = 1; y < canvas.height - 1; y++) {
                    for (let x = 1; x < canvas.width - 1; x++) {
                        const idx = (y * canvas.width + x) * 4;
                        
                        // Contar vecinos negros
                        let blackNeighbors = 0;
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                if (dx === 0 && dy === 0) continue;
                                const nIdx = ((y + dy) * canvas.width + (x + dx)) * 4;
                                if (tempData[nIdx] === 0) blackNeighbors++;
                            }
                        }
                        
                        // Si es un punto aislado, eliminarlo
                        if (tempData[idx] === 0 && blackNeighbors < 2) {
                            data[idx] = data[idx + 1] = data[idx + 2] = 255;
                        }
                    }
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
            this.updateProgress(15, 'Aplicando binarización adaptativa (OTSU)...');
            
            // ✅ MEJORAS 2, 6, 7: Preprocesar con OTSU, escala de grises y reducción de ruido
            const processedImage = await this.preprocessImageForOCR(imageData);
            
            this.updateProgress(20, 'Iniciando OCR optimizado...');
            
            // ✅ MEJORAS 3, 8: Configurar Tesseract con PSM y modo LSTM
            const worker = await Tesseract.createWorker('spa', 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = 20 + (m.progress * 65);
                        this.updateProgress(progress, `Extrayendo texto: ${Math.round(m.progress * 100)}%`);
                    }
                }
            });
            
            // Configurar parámetros de Tesseract para mejor precisión
            await worker.setParameters({
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK, // PSM 6: Bloque uniforme de texto
                tessedit_char_whitelist: '', // Sin restricción general (aplicaremos específica después)
                load_system_dawg: '0',  // ✅ MEJORA 8: Deshabilitar diccionarios
                load_freq_dawg: '0',
                load_unambig_dawg: '0',
                load_punc_dawg: '0',
                load_number_dawg: '0',
                load_fixedlength_dawg: '0',
                load_bigram_dawg: '0',
                wordrec_enable_assoc: '0',
                language_model_penalty_non_dict_word: '0',
                language_model_penalty_non_freq_dict_word: '0'
            });
            
            const { data: { text } } = await worker.recognize(processedImage);
            await worker.terminate();
            
            this.updateProgress(90, 'Texto extraído. Analizando datos...');
            
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
            console.log('Nombre detectado:', name);
        } else {
            console.log('No se detectó nombre (no es crítico si hay CURP)');
        }
        
        // Resumen
        if (doc) {
            console.log('Con CURP/RFC es suficiente para buscar la firma');
        } else {
            console.log('Sin CURP/RFC no se podrá buscar automáticamente');
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
                console.log(`Total firmas obtenidas de Firebase: ${signatures.length}`);
            } catch (e) {
                console.error('Error obteniendo firmas de Firebase:', e);
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

            // ===== COORDENADAS PROPORCIONALES AL TAMAÑO DE LA IMAGEN =====
            // Calcular escala basada en el ancho de la página
            const BASE_WIDTH = 1000; // Ancho de referencia para las coordenadas originales
            const scale = pageWidth / BASE_WIDTH;
            
            console.log(`📐 Escala individual: ${scale.toFixed(2)}x (página ${pageWidth}px)`);
            
            // Dibujar firma del usuario
            page.drawImage(userSigImage, {
                x: this.COORDENADAS.usuario.x * scale,
                y: pageHeight - (this.COORDENADAS.usuario.y * scale) - (this.COORDENADAS.usuario.alto * scale),
                width: this.COORDENADAS.usuario.ancho * scale,
                height: this.COORDENADAS.usuario.alto * scale,
            });

            // Dibujar firma del representante
            page.drawImage(repSigImage, {
                x: this.COORDENADAS.representante.x * scale,
                y: pageHeight - (this.COORDENADAS.representante.y * scale) - (this.COORDENADAS.representante.alto * scale),
                width: this.COORDENADAS.representante.ancho * scale,
                height: this.COORDENADAS.representante.alto * scale,
            });

            // Guardar el PDF final
            const pdfBytes = await pdfDoc.save();
            
            // Descargar el PDF
            this.downloadPdf(pdfBytes, this.currentSignature.fullName);

            // Marcar como impresa automáticamente
            await this.markAsPrinted(this.currentSignature.id);

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
        
        // Total de firmas
        document.getElementById('totalSignatures').textContent = signatures.length;
        
        // Firmas de hoy
        const today = this.getDateWithoutTime(new Date());
        
        const todaySignatures = signatures.filter(sig => {
            if (!sig.timestamp) return false;
            const sigDate = this.getDateWithoutTime(sig.timestamp);
            return sigDate.getTime() === today.getTime();
        });
        
        document.getElementById('todaySignatures').textContent = todaySignatures.length;
        
        // Mostrar fecha actual
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const todayFormatted = today.toLocaleDateString('es-MX', dateOptions);
        document.getElementById('todayDate').textContent = todayFormatted;
        
        // Estado de firma del representante
        const hasRep = this.representantSignature || localStorage.getItem('representant_signature');
        document.getElementById('repSignatureStatus').textContent = hasRep ? '✓' : '✗';
        
        // Actualizar info de asistencia si hay lista cargada
        if (this.attendanceList && this.attendanceList.length > 0) {
            await this.updateAttendanceInfo();
        }
    }

    // Funciones para Google Sheets
    async searchSignaturesInModal() {
        const searchTerm = document.getElementById('searchInput').value.trim();
        const dateFilter = document.getElementById('signaturesDateFilter').value;
        
        if (!searchTerm || searchTerm.length < 3) {
            alert('⚠️ Ingresa al menos 3 caracteres para buscar');
            return;
        }

        const searchBtn = document.getElementById('searchBtn');
        const originalText = searchBtn.textContent;
        searchBtn.disabled = true;
        searchBtn.textContent = 'Buscando...';

        try {
            // Obtener firmas con filtro de fecha si aplica
            let signatures = await this.getAllSignatures();
            
            // Aplicar filtro de fecha si existe
            if (dateFilter) {
                const targetDate = this.getLocalDateFromString(dateFilter);
                
                signatures = signatures.filter(sig => {
                    if (!sig.timestamp) return false;
                    const sigDate = this.getDateWithoutTime(sig.timestamp);
                    return sigDate.getTime() === targetDate.getTime();
                });
            }
            
            // Normalizar término de búsqueda (sin acentos, mayúsculas)
            const searchNormalized = searchTerm
                .toUpperCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim();
            
            console.log(`🔍 Búsqueda normalizada: "${searchTerm}" → "${searchNormalized}"`);
            
            // Buscar por nombre o CURP (normalizado)
            const results = signatures.filter(sig => {
                // Normalizar nombre de la firma
                const nameNormalized = sig.fullName
                    .toUpperCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "");
                
                // Normalizar CURP/RFC
                const docNormalized = sig.document
                    .toUpperCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "");
                
                // Buscar coincidencia
                return nameNormalized.includes(searchNormalized) ||
                       docNormalized.includes(searchNormalized);
            });

            this.displaySearchResultsInModal(results);

        } catch (error) {
            console.error('Error en búsqueda:', error);
            alert('❌ Error al buscar firmas');
        } finally {
            searchBtn.disabled = false;
            searchBtn.textContent = originalText;
        }
    }

    displaySearchResultsInModal(results) {
        const resultsSection = document.getElementById('searchResults');
        const resultsList = document.getElementById('searchResultsList');
        const mainList = document.getElementById('signaturesList');
        const counter = document.getElementById('signaturesCounter');
        const counterText = document.getElementById('signaturesCountText');

        // Ocultar lista principal y mostrar resultados
        mainList.style.display = 'none';
        resultsSection.style.display = 'block';
        
        // Actualizar contador
        counter.style.display = 'block';
        counterText.textContent = `${results.length} resultado${results.length !== 1 ? 's' : ''} de búsqueda`;

        if (results.length === 0) {
            resultsList.innerHTML = `
                <div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; padding: 30px; text-align: center; grid-column: 1 / -1;">
                    <h3 style="color: #dc2626; margin: 0 0 10px 0;">❌ Sin resultados</h3>
                    <p style="color: #991b1b; margin: 0;">No se encontraron firmas con ese criterio de búsqueda.</p>
                </div>
            `;
        } else {
            // Limpiar lista
            resultsList.innerHTML = '';
            
            // Crear tarjetas igual que en showSignaturesList
            results.forEach(sig => {
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
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-edit-signature" data-id="${sig.id}" style="background: #3b82f6; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; transition: background 0.2s;">
                            ✏️  
                        </button>
                        <button class="btn-delete-signature" data-id="${sig.id}" data-name="${sig.fullName}" style="background: #ef4444; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; transition: background 0.2s;">
                            🗑️
                        </button>
                    </div>
                `;
                
                // Agregar evento de edición
                const editBtn = card.querySelector('.btn-edit-signature');
                editBtn.addEventListener('mouseover', () => editBtn.style.background = '#2563eb');
                editBtn.addEventListener('mouseout', () => editBtn.style.background = '#3b82f6');
                editBtn.addEventListener('click', () => this.editSignature(sig));
                
                // Agregar evento de eliminación
                const deleteBtn = card.querySelector('.btn-delete-signature');
                deleteBtn.addEventListener('mouseover', () => deleteBtn.style.background = '#dc2626');
                deleteBtn.addEventListener('mouseout', () => deleteBtn.style.background = '#ef4444');
                deleteBtn.addEventListener('click', () => this.deleteSignature(sig.id, sig.fullName));
                
                resultsList.appendChild(card);
            });
        }
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

    // ==================== CONTROL DE ASISTENCIA ====================
    
    async loadStoredAttendanceList() {
        // Intentar cargar desde localStorage primero
        const storedList = localStorage.getItem('attendanceList');
        const storedDate = localStorage.getItem('attendanceListDate');
        const today = new Date().toISOString().split('T')[0];
        
        if (storedList && storedDate === today) {
            this.attendanceList = JSON.parse(storedList);
            this.attendanceSheetName = localStorage.getItem('attendanceSheetName') || 'N/A';
            this.attendanceDate = storedDate;
            console.log(`✅ Lista de asistencia cargada desde localStorage: ${this.attendanceList.length} personas`);
            document.getElementById('loadedSheetName').textContent = this.attendanceSheetName;
            document.getElementById('loadedAttendanceDate').textContent = this.formatDisplayDate(storedDate);
            await this.updateAttendanceInfo();
            return;
        }
        
        // Si no hay en localStorage o es de otro día, intentar Firestore
        if (CONFIG.USE_FIREBASE && db) {
            try {
                const doc = await db.collection('attendance_lists').doc(today).get();
                if (doc.exists) {
                    const data = doc.data();
                    this.attendanceList = data.list;
                    this.attendanceSheetName = data.sheetName || 'N/A';
                    this.attendanceDate = data.date || today;
                    console.log(`✅ Lista de asistencia cargada desde Firestore: ${this.attendanceList.length} personas`);
                    
                    // Guardar en localStorage para cache
                    localStorage.setItem('attendanceList', JSON.stringify(this.attendanceList));
                    localStorage.setItem('attendanceListDate', this.attendanceDate);
                    localStorage.setItem('attendanceSheetName', this.attendanceSheetName);
                    
                    document.getElementById('loadedSheetName').textContent = this.attendanceSheetName;
                    document.getElementById('loadedAttendanceDate').textContent = this.formatDisplayDate(this.attendanceDate);
                    await this.updateAttendanceInfo();
                }
            } catch (error) {
                console.warn('⚠️ No se pudo cargar lista de Firestore:', error);
            }
        }
    }
    
    async loadAttendanceList(file, sheetName = null) {
        try {
            console.log('📂 Cargando archivo Excel:', file.name);
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    console.log('📚 Hojas disponibles:', workbook.SheetNames);
                    
                    // Si no se especificó una hoja, intentar detectar automáticamente
                    let selectedSheetName = sheetName;
                    
                    if (!selectedSheetName) {
                        // Usar fecha seleccionada o hoy
                        const targetDate = this.selectedAttendanceDate || new Date().toISOString().split('T')[0];
                        selectedSheetName = this.detectDateSheet(workbook.SheetNames, targetDate);
                        
                        // Si no se detectó automáticamente y hay múltiples hojas, mostrar selector
                        if (!selectedSheetName && workbook.SheetNames.length > 1) {
                            this.showSheetSelector(workbook, file);
                            return;
                        }
                        
                        // Si solo hay una hoja o se detectó, usarla
                        selectedSheetName = selectedSheetName || workbook.SheetNames[0];
                    }
                    
                    console.log('📋 Usando hoja:', selectedSheetName);
                    
                    // Leer la hoja seleccionada
                    const sheet = workbook.Sheets[selectedSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                    
                    console.log('📊 Primeras 5 filas del Excel:', jsonData.slice(0, 5));
                    console.log('📊 Total de filas:', jsonData.length);
                    
                    // Extraer nombres de la columna B (índice 1)
                    const attendanceList = [];
                    let startRow = 0;
                    
                    // Buscar la fila donde empiezan los datos (después del encabezado)
                    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
                        const row = jsonData[i];
                        if (row && row[1]) {
                            const cellValue = String(row[1]).trim().toLowerCase();
                            // Si encontramos "nombre" o similar, los datos empiezan en la siguiente fila
                            if (cellValue === 'nombre' || cellValue === 'nombres' || cellValue === 'nombre completo') {
                                startRow = i + 1;
                                console.log(`📌 Encabezado encontrado en fila ${i}, datos comienzan en fila ${startRow}`);
                                break;
                            }
                        }
                    }
                    
                    // Si no encontramos encabezado explícito, asumimos que la primera fila son datos
                    if (startRow === 0 && jsonData.length > 0 && jsonData[0] && jsonData[0][1]) {
                        const firstCell = String(jsonData[0][1]).trim();
                        // Verificar si parece un nombre (más de 5 caracteres, contiene espacios)
                        if (firstCell.length > 5 && firstCell.includes(' ')) {
                            startRow = 0;
                            console.log('📌 No se encontró encabezado, asumiendo que la fila 0 son datos');
                        } else {
                            startRow = 1;
                            console.log('📌 Primera fila parece encabezado, datos desde fila 1');
                        }
                    }
                    
                    // Extraer nombres desde startRow (columna B = índice 1, columna M = índice 12)
                    for (let i = startRow; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (row && row[1]) {
                            const name = String(row[1]).trim();
                            const gestor = row[12] ? String(row[12]).trim().toUpperCase() : 'SIN GESTOR';
                            
                            // Validar que es un nombre válido
                            if (name && 
                                name.length > 2 && 
                                name.toLowerCase() !== 'nombre' && 
                                name.toLowerCase() !== 'nombres' &&
                                name.toLowerCase() !== 'nombre completo' &&
                                !name.match(/^[0-9]+$/)) { // Ignorar solo números
                                
                                attendanceList.push({
                                    name: name.toUpperCase(),
                                    normalized: this.normalizeNameForMatch(name),
                                    gestor: gestor
                                });
                            }
                        }
                    }
                    
                    console.log(`✅ Nombres extraídos: ${attendanceList.length}`);
                    if (attendanceList.length > 0) {
                        console.log('📋 Primeros 3 nombres:', attendanceList.slice(0, 3));
                    }
                    
                    if (attendanceList.length === 0) {
                        alert('⚠️ No se encontraron nombres válidos en la hoja seleccionada.\n\nVerifica que:\n- Los nombres estén en la columna B (segunda columna)\n- Haya al menos una fila con datos\n- Los nombres tengan más de 2 caracteres');
                        console.error('❌ Estructura del Excel:', jsonData.slice(0, 10));
                        return;
                    }
                    
                    console.log(`✅ ${attendanceList.length} nombres cargados:`, attendanceList);
                    
                    // Guardar en memoria
                    const attendanceDate = this.selectedAttendanceDate || new Date().toISOString().split('T')[0];
                    this.attendanceList = attendanceList;
                    this.attendanceSheetName = selectedSheetName;
                    this.attendanceDate = attendanceDate;
                    
                    // Guardar workbook completo para poder cambiar fechas sin recargar
                    this.savedWorkbook = workbook;
                    
                    // Guardar en Firestore
                    if (CONFIG.USE_FIREBASE && db) {
                        try {
                            await db.collection('attendance_lists').doc(attendanceDate).set({
                                list: attendanceList,
                                sheetName: selectedSheetName,
                                date: attendanceDate,
                                uploadDate: new Date().toISOString(),
                                count: attendanceList.length
                            });
                            console.log('✅ Lista guardada en Firestore');
                        } catch (error) {
                            console.warn('⚠️ No se pudo guardar en Firestore:', error);
                        }
                    }
                    
                    // Guardar en localStorage como backup (sin el workbook completo)
                    localStorage.setItem('attendanceList', JSON.stringify(attendanceList));
                    localStorage.setItem('attendanceListDate', attendanceDate);
                    localStorage.setItem('attendanceSheetName', selectedSheetName);
                    localStorage.setItem('attendanceWorkbookSheets', JSON.stringify(workbook.SheetNames));
                    
                    // Ocultar selector si estaba visible
                    document.getElementById('sheetSelector').style.display = 'none';
                    
                    // Mostrar indicador de que puede cambiar fecha
                    document.getElementById('dateChangeIndicator').style.display = 'block';
                    
                    // Actualizar UI
                    document.getElementById('loadedSheetName').textContent = selectedSheetName;
                    document.getElementById('loadedAttendanceDate').textContent = this.formatDisplayDate(attendanceDate);
                    this.updateAttendanceInfo();
                    
                    // Feedback visual ya está en la UI, no necesitamos alerta
                    console.log(`✅ Lista cargada: ${attendanceList.length} personas para ${this.formatDisplayDate(attendanceDate)}`);
                    
                } catch (error) {
                    console.error('❌ Error procesando Excel:', error);
                    alert('❌ Error al procesar el archivo Excel.\n\nAsegúrate de que sea un archivo .xlsx o .xls válido.');
                }
            };
            
            reader.readAsArrayBuffer(file);
            
        } catch (error) {
            console.error('❌ Error cargando archivo:', error);
            alert('❌ Error al cargar el archivo. Intenta de nuevo.');
        }
    }

    async reloadAttendanceFromWorkbook() {
        if (!this.savedWorkbook) {
            console.warn('⚠️ No hay workbook guardado para recargar');
            return;
        }

        try {
            const targetDate = this.selectedAttendanceDate || new Date().toISOString().split('T')[0];
            console.log(`🔄 Recargando lista para fecha: ${targetDate}`);

            // Intentar detectar la hoja para la nueva fecha
            let selectedSheetName = this.detectDateSheet(this.savedWorkbook.SheetNames, targetDate);
            
            // Si no se detectó, usar la última hoja cargada
            if (!selectedSheetName) {
                selectedSheetName = this.attendanceSheetName;
                console.log(`📋 No se detectó hoja automáticamente, usando última hoja: ${selectedSheetName}`);
            } else {
                console.log(`✅ Hoja detectada automáticamente: ${selectedSheetName}`);
            }

            // Leer la hoja seleccionada
            const sheet = this.savedWorkbook.Sheets[selectedSheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            // Extraer nombres (mismo proceso que en loadAttendanceList)
            const attendanceList = [];
            let startRow = 0;

            // Buscar la fila donde empiezan los datos
            for (let i = 0; i < Math.min(10, jsonData.length); i++) {
                const row = jsonData[i];
                if (row && row[1]) {
                    const cellValue = String(row[1]).trim().toLowerCase();
                    if (cellValue === 'nombre' || cellValue === 'nombres' || cellValue === 'nombre completo') {
                        startRow = i + 1;
                        break;
                    }
                }
            }

            if (startRow === 0 && jsonData.length > 0 && jsonData[0] && jsonData[0][1]) {
                const firstCell = String(jsonData[0][1]).trim();
                if (firstCell.length > 5 && firstCell.includes(' ')) {
                    startRow = 0;
                } else {
                    startRow = 1;
                }
            }

            // Extraer nombres
            for (let i = startRow; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row && row[1]) {
                    const name = String(row[1]).trim();
                    const gestor = row[12] ? String(row[12]).trim().toUpperCase() : 'SIN GESTOR';

                    if (name && 
                        name.length > 2 && 
                        name.toLowerCase() !== 'nombre' && 
                        name.toLowerCase() !== 'nombres' &&
                        name.toLowerCase() !== 'nombre completo' &&
                        !name.match(/^[0-9]+$/)) {
                        
                        attendanceList.push({
                            name: name.toUpperCase(),
                            normalized: this.normalizeNameForMatch(name),
                            gestor: gestor
                        });
                    }
                }
            }

            console.log(`✅ ${attendanceList.length} nombres recargados para ${targetDate}`);

            // Actualizar en memoria
            this.attendanceList = attendanceList;
            this.attendanceSheetName = selectedSheetName;
            this.attendanceDate = targetDate;

            // Actualizar localStorage
            localStorage.setItem('attendanceList', JSON.stringify(attendanceList));
            localStorage.setItem('attendanceListDate', targetDate);
            localStorage.setItem('attendanceSheetName', selectedSheetName);

            // Limpiar constancias cargadas (son para otra fecha)
            this.constanciasMap.clear();

            // Actualizar UI
            document.getElementById('loadedSheetName').textContent = selectedSheetName;
            document.getElementById('loadedAttendanceDate').textContent = this.formatDisplayDate(targetDate);
            await this.updateAttendanceInfo();

            // Si la tabla de cotejo está visible, recargarla
            if (document.getElementById('attendanceCheckSection').style.display !== 'none') {
                await this.showAttendanceCheck(this.currentFilterOnlyMissing || false);
            }

            // Mostrar notificación
            const notification = document.createElement('div');
            notification.innerHTML = `
                <div style="position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 15px 25px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 10000; animation: slideIn 0.3s;">
                    <div style="font-weight: 600; margin-bottom: 5px;">✅ Lista actualizada</div>
                    <div style="font-size: 0.9rem;">Fecha: ${this.formatDisplayDate(targetDate)}</div>
                    <div style="font-size: 0.9rem;">Hoja: ${selectedSheetName}</div>
                    <div style="font-size: 0.9rem;">Personas: ${attendanceList.length}</div>
                </div>
                <style>
                    @keyframes slideIn {
                        from { transform: translateX(400px); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                </style>
            `;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 4000);

            console.log('✅ Lista recargada exitosamente');

        } catch (error) {
            console.error('❌ Error recargando lista:', error);
            alert(`❌ Error al recargar la lista para la nueva fecha.\n\nPuedes cargar el Excel nuevamente si es necesario.`);
        }
    }

    detectDateSheet(sheetNames, dateString) {
        // dateString en formato YYYY-MM-DD
        const today = new Date(dateString + 'T12:00:00');
        
        // Formatos a buscar
        const patterns = [
            // Formato Excel típico: "01 DE DICIEMBRE 2025", "02 DE DICIEMBRE 2025"
            `${String(today.getDate()).padStart(2, '0')} DE ${this.getMonthName(today.getMonth()).toUpperCase()} ${today.getFullYear()}`,
            `${today.getDate()} DE ${this.getMonthName(today.getMonth()).toUpperCase()} ${today.getFullYear()}`,
            
            // Formato: "01 de Diciembre 2025" (minúsculas)
            `${String(today.getDate()).padStart(2, '0')} de ${this.getMonthName(today.getMonth())} ${today.getFullYear()}`,
            `${today.getDate()} de ${this.getMonthName(today.getMonth())} ${today.getFullYear()}`,
            
            // Formato: "3 Diciembre", "03 Diciembre"
            `${today.getDate()} ${this.getMonthName(today.getMonth())}`,
            `${String(today.getDate()).padStart(2, '0')} ${this.getMonthName(today.getMonth())}`,
            
            // Formato: "Dic 3", "Dic 03"
            `${this.getMonthShort(today.getMonth())} ${today.getDate()}`,
            `${this.getMonthShort(today.getMonth())} ${String(today.getDate()).padStart(2, '0')}`,
            
            // Formato: "03-12-2025", "3-12-2025"
            `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`,
            `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`,
            
            // Formato: "03/12/2025", "3/12/2025"
            `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`,
            `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`,
            
            // Día de la semana: "Martes", "Mar"
            this.getDayName(today.getDay()),
            this.getDayShort(today.getDay()),
            
            // Solo el número del día
            String(today.getDate()).padStart(2, '0'),
            String(today.getDate())
        ];
        
        console.log('🔍 Buscando hojas con estos patrones:', patterns);
        console.log('📚 Hojas disponibles:', sheetNames);
        
        // Buscar coincidencia exacta primero
        for (const pattern of patterns) {
            for (const sheetName of sheetNames) {
                const normalizedSheet = sheetName.toLowerCase().trim();
                const normalizedPattern = pattern.toLowerCase();
                
                if (normalizedSheet === normalizedPattern) {
                    console.log(`✅ Hoja detectada (exacta): "${sheetName}" = "${pattern}"`);
                    return sheetName;
                }
            }
        }
        
        // Buscar coincidencia parcial
        for (const pattern of patterns) {
            for (const sheetName of sheetNames) {
                const normalizedSheet = sheetName.toLowerCase().trim();
                const normalizedPattern = pattern.toLowerCase();
                
                if (normalizedSheet.includes(normalizedPattern)) {
                    console.log(`✅ Hoja detectada (contiene): "${sheetName}" incluye "${pattern}"`);
                    return sheetName;
                }
            }
        }
        
        console.log('⚠️ No se detectó automáticamente la hoja del día');
        return null;
    }

    showSheetSelector(workbook, file) {
        const selector = document.getElementById('sheetSelector');
        const select = document.getElementById('sheetSelect');
        
        // Limpiar opciones anteriores
        select.innerHTML = '';
        
        // Agregar opciones
        workbook.SheetNames.forEach(sheetName => {
            const option = document.createElement('option');
            option.value = sheetName;
            option.textContent = sheetName;
            select.appendChild(option);
        });
        
        // Guardar referencia al workbook y archivo
        this.currentWorkbook = workbook;
        this.currentFile = file;
        
        // Mostrar selector
        selector.style.display = 'block';
        
        // Event listener para confirmar selección (solo si no existe)
        const confirmBtn = document.getElementById('confirmSheetBtn');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        newConfirmBtn.addEventListener('click', () => {
            const selectedSheet = select.value;
            this.loadAttendanceList(file, selectedSheet);
        });
    }

    getMonthName(month) {
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return months[month];
    }

    getMonthShort(month) {
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 
                       'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return months[month];
    }

    getDayName(day) {
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        return days[day];
    }

    getDayShort(day) {
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        return days[day];
    }

    // Helper para crear fecha local desde string YYYY-MM-DD sin problemas de zona horaria
    getLocalDateFromString(dateString) {
        // Dividir el string "YYYY-MM-DD"
        const [year, month, day] = dateString.split('-').map(Number);
        // Crear fecha local (mes es 0-indexed en JavaScript)
        const date = new Date(year, month - 1, day);
        date.setHours(0, 0, 0, 0);
        return date;
    }

    // Helper para obtener fecha sin hora de un timestamp
    getDateWithoutTime(timestamp) {
        const date = new Date(timestamp);
        date.setHours(0, 0, 0, 0);
        return date;
    }

    normalizeNameForMatch(name) {
        // Normalizar nombre para comparación (remover acentos, mayúsculas, espacios extras)
        return name
            .toUpperCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/Ñ/g, 'N')  // Convertir Ñ a N para matching
            .replace(/\s+/g, ' ')
            .trim();
    }

    async updateAttendanceInfo() {
        if (!this.attendanceList || this.attendanceList.length === 0) {
            document.getElementById('attendanceInfo').style.display = 'none';
            document.getElementById('viewAttendanceBtn').style.display = 'none';
            return;
        }

        // Obtener TODAS las firmas (no solo las de hoy)
        const allSignatures = await this.getAllSignatures();
        
        // Comparar con lista esperada (SIN FILTRAR - mostrar totales generales)
        let presentCount = 0;
        let printedCount = 0;
        let constanciasCount = 0;
        
        for (const expected of this.attendanceList) {
            const signature = allSignatures.find(sig => {
                const sigNormalized = this.normalizeNameForMatch(sig.fullName);
                return sigNormalized === expected.normalized;
            });
            
            if (signature) {
                presentCount++;
                // Verificar si está impresa para ESTE curso
                const courseDate = this.attendanceDate || new Date().toISOString().split('T')[0];
                const printedCourses = signature.printedCourses || [];
                if (printedCourses.includes(courseDate)) {
                    printedCount++;
                }
            }
            
            // Contar constancias cargadas
            if (this.constanciasMap.has(expected.normalized)) {
                constanciasCount++;
            }
        }
        
        const missingCount = this.attendanceList.length - presentCount;
        const constanciasMissing = this.attendanceList.length - constanciasCount;
        
        // Actualizar UI con totales generales
        document.getElementById('attendanceTotal').textContent = this.attendanceList.length;
        document.getElementById('attendancePresent').textContent = `${presentCount} Firmaron`;
        document.getElementById('attendanceMissing').textContent = `${missingCount} Faltan`;
        document.getElementById('attendanceConstancias').textContent = `${constanciasCount}/${this.attendanceList.length} Constancias`;
        document.getElementById('attendancePrinted').textContent = `${printedCount} Impresas`;
        document.getElementById('attendanceInfo').style.display = 'block';
        document.getElementById('viewAttendanceBtn').style.display = 'block';
    }

    updateGestorFilter(gestores) {
        const filterDiv = document.getElementById('gestorFilterTable');
        if (!filterDiv) return;
        
        const select = document.getElementById('gestorSelect');
        if (!select) return;
        
        // Guardar la selección actual antes de reconstruir
        const currentSelection = this.selectedGestor || 'TODOS';
        
        // Limpiar opciones anteriores
        select.innerHTML = '<option value="TODOS">TODOS LOS GESTORES</option>';
        
        // Agregar gestores
        gestores.forEach(gestor => {
            const option = document.createElement('option');
            option.value = gestor;
            option.textContent = gestor;
            select.appendChild(option);
        });
        
        // Restaurar selección actual
        select.value = currentSelection;
        
        // Event listener para cambio de gestor
        select.onchange = async () => {
            this.selectedGestor = select.value;
            console.log('📊 Gestor seleccionado:', this.selectedGestor);
            // Recargar la tabla con el nuevo filtro
            await this.showAttendanceCheck(this.currentFilterOnlyMissing || false);
        };
    }

    async getTodaySignatures() {
        const allSignatures = await this.getAllSignatures();
        
        // Usar fecha de asistencia cargada o fecha del selector, o hoy por defecto
        const targetDateString = this.attendanceDate || this.selectedAttendanceDate || new Date().toISOString().split('T')[0];
        const targetDate = this.getLocalDateFromString(targetDateString);
        
        return allSignatures.filter(sig => {
            const sigDate = this.getDateWithoutTime(sig.timestamp);
            return sigDate.getTime() === targetDate.getTime();
        });
    }

    formatDisplayDate(dateString) {
        // Formato: YYYY-MM-DD → "Martes, 3 de Diciembre de 2025"
        const date = this.getLocalDateFromString(dateString);
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('es-MX', options);
    }

    async showAttendanceCheck(onlyMissing = false, scrollToTop = true) {
        if (!this.attendanceList || this.attendanceList.length === 0) {
            document.getElementById('noAttendanceMessage').style.display = 'block';
            document.getElementById('attendanceTable').style.display = 'none';
            document.getElementById('gestorFilterTable').style.display = 'none';
            document.getElementById('attendanceCheckSection').style.display = 'block';
            return;
        }

        // Guardar posición actual del scroll antes de recargar
        const scrollPosition = scrollToTop ? null : window.pageYOffset || document.documentElement.scrollTop;

        // Guardar estado del filtro de faltantes
        this.currentFilterOnlyMissing = onlyMissing;

        // Extraer y actualizar gestores únicos
        const gestores = [...new Set(this.attendanceList.map(item => item.gestor))].sort();
        this.updateGestorFilter(gestores);
        
        // Mostrar el filtro de gestores
        document.getElementById('gestorFilterTable').style.display = 'block';

        // Obtener TODAS las firmas (no solo las de hoy)
        const allSignatures = await this.getAllSignatures();
        
        // Filtrar lista por gestor seleccionado
        const filteredList = this.selectedGestor === 'TODOS' 
            ? this.attendanceList 
            : this.attendanceList.filter(item => item.gestor === this.selectedGestor);
        
        // Crear tabla comparativa
        const tbody = document.getElementById('attendanceTableBody');
        tbody.innerHTML = '';
        
        let rowNumber = 1;
        
        for (const expected of filteredList) {
            // Buscar si firmó (en cualquier fecha)
            const signature = allSignatures.find(sig => {
                const sigNormalized = this.normalizeNameForMatch(sig.fullName);
                return sigNormalized === expected.normalized;
            });
            
            const hasSignature = !!signature;
            
            // Filtrar si solo queremos faltantes
            if (onlyMissing && hasSignature) continue;
            
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #e5e7eb';
            
            // Aplicar color de fondo según estado
            if (hasSignature) {
                row.style.background = '#f0fdf4';
            } else {
                row.style.background = '#fef2f2';
            }
            
            const statusIcon = hasSignature ? '✓' : '✗';
            const statusText = hasSignature ? '' : '';
            const statusColor = hasSignature ? '#10b981' : '#ef4444';
            
            const timeText = hasSignature 
                ? new Date(signature.timestamp).toLocaleString('es-MX', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })
                : '-';
            
            const curpText = hasSignature && signature.document ? signature.document : '-';
            
            // Verificar si tiene constancia cargada
            const hasConstancia = this.constanciasMap.has(expected.normalized);
            const constanciaIcon = hasConstancia ? '✓' : '✗';
            const constanciaText = hasConstancia ? '' : '';
            const constanciaColor = hasConstancia ? '#10b981' : '#ef4444';
            
            // Crear ID único para esta fila
            const rowId = `row_${rowNumber}_${expected.normalized.replace(/\s+/g, '_')}`;
            
            // Verificar si está marcada como impresa para ESTE curso
            const courseDate = this.attendanceDate || new Date().toISOString().split('T')[0];
            const printedCourses = hasSignature && signature.printedCourses ? signature.printedCourses : [];
            const isPrinted = printedCourses.includes(courseDate);
            const printedIcon = isPrinted ? '✓' : (hasSignature ? '○' : '-');
            const printedText = isPrinted ? '' : (hasSignature ? '' : '-');
            const printedColor = isPrinted ? '#10b981' : '#f59e0b';
            
            row.innerHTML = `
                <td style="padding: 12px; text-align: left; font-weight: 500; color: #64748b;">${rowNumber}</td>
                <td style="padding: 12px; text-align: left; font-weight: 500; color: #1f2937;">${expected.name}</td>
                <td style="padding: 12px; text-align: center; color: #64748b; font-weight: 500;">${expected.gestor}</td>
                <td style="padding: 12px; text-align: center;">
                    <div style="display: flex; gap: 8px; align-items: center; justify-content: center;">
                        <span style="display: inline-block; padding: 4px 12px; background: ${constanciaColor}15; border: 1px solid ${constanciaColor}; border-radius: 4px; font-weight: 600; font-size: 0.85rem; color: ${constanciaColor};">
                            ${constanciaIcon} ${constanciaText}
                        </span>
                        ${!hasConstancia ? `
                            <button 
                                onclick="adminPDF.uploadManualConstancia('${expected.normalized}', '${expected.name.replace(/'/g, "\\'")}')"
                                style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; white-space: nowrap; transition: background 0.2s; pointer-events: auto;"
                                onmouseover="this.style.background='#2563eb'"
                                onmouseout="this.style.background='#3b82f6'"
                                title="Subir constancia manualmente"
                            >
                                📤
                            </button>
                        ` : `
                            <button 
                                onclick="adminPDF.downloadSingleConstancia('${expected.normalized}', '${expected.name.replace(/'/g, "\\'")}')"
                                style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; white-space: nowrap; transition: background 0.2s; pointer-events: auto;"
                                onmouseover="this.style.background='#059669'"
                                onmouseout="this.style.background='#10b981'"
                                title="Descargar constancia firmada"
                            >
                                📥
                            </button>
                            <button 
                                onclick="adminPDF.removeConstancia('${expected.normalized}', '${expected.name.replace(/'/g, "\\'")}')"
                                style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; white-space: nowrap; transition: background 0.2s; pointer-events: auto;"
                                onmouseover="this.style.background='#dc2626'"
                                onmouseout="this.style.background='#ef4444'"
                                title="Quitar constancia"
                            >
                                🗑️
                            </button>
                        `}
                    </div>
                </td>
                <td style="padding: 12px; text-align: center;">
                    <span style="display: inline-block; padding: 4px 12px; background: ${statusColor}15; border: 1px solid ${statusColor}; border-radius: 4px; font-weight: 600; font-size: 0.85rem; color: ${statusColor};">
                        ${statusIcon} ${statusText}
                    </span>
                </td>
                <td style="padding: 12px; text-align: center; color: #64748b; font-weight: 500;">${timeText}</td>
                <td style="padding: 12px; text-align: center; color: #64748b; font-size: 0.9rem;">${curpText}</td>
                <td style="padding: 12px; text-align: center;">
                    ${hasSignature ? `
                        <button 
                            onclick="adminPDF.togglePrintedStatus('${signature.id}', ${!isPrinted})"
                            style="padding: 8px 16px; border: 2px solid ${printedColor}; background: ${isPrinted ? '#f0fdf4' : 'white'}; color: ${printedColor}; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: all 0.3s;"
                            onmouseover="this.style.background='${printedColor}'; this.style.color='white';"
                            onmouseout="this.style.background='${isPrinted ? '#f0fdf4' : 'white'}'; this.style.color='${printedColor}';"
                        >
                            ${printedIcon} ${printedText}
                        </button>
                    ` : `<span style="color: #9ca3af;">-</span>`}
                </td>
            `;
            
            rowNumber++;
            tbody.appendChild(row);
        }
        
        // Mostrar sección
        document.getElementById('noAttendanceMessage').style.display = 'none';
        document.getElementById('attendanceTable').style.display = 'table';
        document.getElementById('attendanceCheckSection').style.display = 'block';
        
        // Scroll a la tabla solo si se especifica, de lo contrario mantener posición
        if (scrollToTop) {
            document.getElementById('attendanceCheckSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (scrollPosition !== null) {
            // Restaurar posición anterior
            setTimeout(() => {
                window.scrollTo({ top: scrollPosition, behavior: 'auto' });
            }, 0);
        }
    }

    async togglePrintedStatus(signatureId, newStatus) {
        try {
            const courseDate = this.attendanceDate || new Date().toISOString().split('T')[0];
            console.log(`🖨️ Cambiando estado de impresión: ${signatureId} → ${newStatus} para curso ${courseDate}`);
            
            // Actualizar en Firestore
            if (CONFIG.USE_FIREBASE && db) {
                try {
                    const docRef = db.collection('signatures').doc(signatureId);
                    const doc = await docRef.get();
                    let printedCourses = doc.exists && doc.data().printedCourses ? doc.data().printedCourses : [];
                    
                    if (newStatus) {
                        // Agregar fecha si no existe
                        if (!printedCourses.includes(courseDate)) {
                            printedCourses.push(courseDate);
                        }
                    } else {
                        // Remover fecha del array
                        printedCourses = printedCourses.filter(date => date !== courseDate);
                    }
                    
                    await docRef.update({
                        printedCourses: printedCourses,
                        lastPrintedDate: newStatus ? new Date().toISOString() : null,
                        // Mantener compatibilidad
                        printed: printedCourses.length > 0,
                        printedDate: newStatus ? new Date().toISOString() : null
                    });
                    console.log('✅ Estado actualizado en Firestore');
                } catch (firestoreError) {
                    console.error('❌ Error actualizando Firestore:', firestoreError);
                }
            }
            
            // Actualizar en localStorage
            let signatures = JSON.parse(localStorage.getItem('signatures') || '[]');
            const sigIndex = signatures.findIndex(sig => sig.id === signatureId);
            
            if (sigIndex !== -1) {
                if (!signatures[sigIndex].printedCourses) {
                    signatures[sigIndex].printedCourses = [];
                }
                
                if (newStatus) {
                    // Agregar fecha si no existe
                    if (!signatures[sigIndex].printedCourses.includes(courseDate)) {
                        signatures[sigIndex].printedCourses.push(courseDate);
                    }
                } else {
                    // Remover fecha del array
                    signatures[sigIndex].printedCourses = signatures[sigIndex].printedCourses.filter(date => date !== courseDate);
                }
                
                signatures[sigIndex].lastPrintedDate = newStatus ? new Date().toISOString() : null;
                // Mantener compatibilidad
                signatures[sigIndex].printed = signatures[sigIndex].printedCourses.length > 0;
                signatures[sigIndex].printedDate = newStatus ? new Date().toISOString() : null;
                
                localStorage.setItem('signatures', JSON.stringify(signatures));
                console.log('✅ Estado actualizado en localStorage');
            }
            
            // Recargar tabla de cotejo SIN hacer scroll (mantener posición)
            await this.showAttendanceCheck(this.currentFilterOnlyMissing || false, false);
            
        } catch (error) {
            console.error('❌ Error al cambiar estado de impresión:', error);
            alert('❌ Error al actualizar el estado. Intenta de nuevo.');
        }
    }

    uploadManualConstancia(normalizedName, fullName) {
        console.log(`📤 Subir constancia manual para: ${fullName}`);
        
        // Crear input file temporal
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.jpg,.jpeg,.png,image/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            console.log(`📄 Archivo seleccionado: ${file.name}`);
            
            // Guardar en el mapa sin OCR
            this.constanciasMap.set(normalizedName, file);
            
            console.log(`✅ Constancia asignada manualmente: ${file.name} → ${fullName}`);
            
            // Actualizar la tabla (sin scroll)
            await this.showAttendanceCheck(this.currentFilterOnlyMissing || false, false);
            
            // Actualizar estadísticas
            await this.updateAttendanceInfo();
            
            // La tabla ya muestra el cambio, no necesitamos alerta
            console.log(`✅ Constancia asignada a: ${fullName}`);
        };
        
        // Trigger click
        input.click();
    }

    removeConstancia(normalizedName, fullName) {
        if (!confirm(`¿Quitar la constancia de:\n\n${fullName}?`)) {
            return;
        }
        
        console.log(`🗑️ Quitando constancia de: ${fullName}`);
        
        // Eliminar del mapa
        this.constanciasMap.delete(normalizedName);
        
        console.log(`✅ Constancia eliminada de: ${fullName}`);
        
        // Actualizar la tabla (sin scroll)
        this.showAttendanceCheck(this.currentFilterOnlyMissing || false, false);
        
        // Actualizar estadísticas
        this.updateAttendanceInfo();
    }

    async downloadSingleConstancia(normalizedName, fullName) {
        let processing;
        try {
            console.log(`📥 Descargando constancia individual para: ${fullName}`);
            
            // Verificar que existe la constancia
            if (!this.constanciasMap.has(normalizedName)) {
                alert('⚠️ No se encontró la constancia cargada.');
                return;
            }
            
            // Verificar que existe la firma del representante
            if (!this.representantSignature) {
                alert('⚠️ Primero debes configurar la firma del representante legal.');
                return;
            }
            
            // Buscar la firma del alumno
            const allSignatures = await this.getAllSignatures();
            const signature = allSignatures.find(sig => {
                const sigNormalized = this.normalizeNameForMatch(sig.fullName);
                return sigNormalized === normalizedName;
            });
            
            if (!signature) {
                alert(`⚠️ No se encontró la firma registrada para:\n${fullName}\n\nLa persona debe firmar primero en la página de captura.`);
                return;
            }
            
            console.log('✅ Firma encontrada:', signature.fullName);
            console.log('✅ Datos de firma disponibles:', !!signature.signature);
            console.log('✅ Firma del representante disponible:', !!this.representantSignature);
            
            // Obtener el archivo de la constancia
            const file = this.constanciasMap.get(normalizedName);
            console.log('📄 Archivo de constancia:', file.name, file.type);
            
            // Mostrar indicador de procesamiento
            processing = document.createElement('div');
            processing.id = 'processingModal';
            processing.innerHTML = `
                <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9999; display: flex; align-items: center; justify-content: center;">
                    <div style="background: white; padding: 30px; border-radius: 12px; text-align: center; max-width: 400px;">
                        <div style="font-size: 3rem; margin-bottom: 15px;">⏳</div>
                        <div style="font-size: 1.2rem; font-weight: 600; color: #1f2937; margin-bottom: 10px;">Procesando constancia...</div>
                        <div style="font-size: 0.9rem; color: #64748b;">Firmando el documento, por favor espera</div>
                    </div>
                </div>
            `;
            document.body.appendChild(processing);
            
            // Esperar un momento para que se muestre el modal
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Procesar el archivo
            console.log('📦 Leyendo archivo...');
            const arrayBuffer = await file.arrayBuffer();
            const header = new Uint8Array(arrayBuffer.slice(0, 5));
            const headerStr = String.fromCharCode(...header);
            
            let pdfDoc;
            const { PDFDocument } = window.PDFLib;
            
            if (!PDFDocument) {
                throw new Error('PDFLib no está disponible. Verifica que la librería esté cargada correctamente.');
            }
            
            // Si es imagen, convertir a PDF
            if (!headerStr.startsWith('%PDF')) {
                console.log('📄 Convirtiendo imagen a PDF...');
                
                // Crear PDF con la imagen
                pdfDoc = await PDFDocument.create();
                
                let imageEmbed;
                if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
                    console.log('🖼️ Incrustando PNG...');
                    imageEmbed = await pdfDoc.embedPng(arrayBuffer);
                } else {
                    console.log('🖼️ Incrustando JPG...');
                    imageEmbed = await pdfDoc.embedJpg(arrayBuffer);
                }
                
                const page = pdfDoc.addPage([imageEmbed.width, imageEmbed.height]);
                page.drawImage(imageEmbed, {
                    x: 0,
                    y: 0,
                    width: imageEmbed.width,
                    height: imageEmbed.height
                });
            } else {
                // Es PDF
                console.log('📄 Cargando PDF existente...');
                pdfDoc = await PDFDocument.load(arrayBuffer);
            }
            
            // Agregar las firmas
            console.log('✍️ Agregando firmas al PDF...');
            const pages = pdfDoc.getPages();
            const firstPage = pages[0];
            
            const pageWidth = firstPage.getWidth();
            const pageHeight = firstPage.getHeight();
            console.log('📐 Dimensiones de la página:', pageWidth, 'x', pageHeight);
            
            // Incrustar firma del usuario
            console.log('👤 Incrustando firma del usuario...');
            const userSignatureImageBytes = await fetch(signature.signature).then(res => res.arrayBuffer());
            const userSignatureImage = await pdfDoc.embedPng(userSignatureImageBytes);
            
            // Incrustar firma del representante
            console.log('🏛️ Incrustando firma del representante...');
            const repSignatureImageBytes = await fetch(this.representantSignature).then(res => res.arrayBuffer());
            const repSignatureImage = await pdfDoc.embedPng(repSignatureImageBytes);
            
            // ✅ COORDENADAS PROPORCIONALES AL TAMAÑO DE LA IMAGEN (igual que signPdfForQueue)
            const BASE_WIDTH = 1000; // Ancho de referencia para las coordenadas originales
            const scale = pageWidth / BASE_WIDTH;
            
            console.log('📐 Escala calculada:', scale.toFixed(2), 'x (página', pageWidth, 'px, base', BASE_WIDTH, 'px)');
            
            // Calcular posiciones proporcionales (igual que en signPdfForQueue)
            const userPos = {
                x: this.COORDENADAS.usuario.x * scale,
                y: pageHeight - (this.COORDENADAS.usuario.y * scale) - (this.COORDENADAS.usuario.alto * scale),
                width: this.COORDENADAS.usuario.ancho * scale,
                height: this.COORDENADAS.usuario.alto * scale,
            };
            
            const repPos = {
                x: this.COORDENADAS.representante.x * scale,
                y: pageHeight - (this.COORDENADAS.representante.y * scale) - (this.COORDENADAS.representante.alto * scale),
                width: this.COORDENADAS.representante.ancho * scale,
                height: this.COORDENADAS.representante.alto * scale,
            };
            
            console.log('📍 Coordenadas usuario (escaladas):', userPos);
            console.log('📍 Coordenadas representante (escaladas):', repPos);
            
            // Dibujar firma del usuario
            firstPage.drawImage(userSignatureImage, userPos);
            
            // Dibujar firma del representante
            firstPage.drawImage(repSignatureImage, repPos);
            
            console.log('✅ Firmas agregadas correctamente');
            
            // Guardar PDF firmado
            console.log('💾 Guardando PDF...');
            const pdfBytes = await pdfDoc.save();
            console.log('✅ PDF guardado, tamaño:', pdfBytes.length, 'bytes');
            
            // Remover indicador de procesamiento
            if (processing && processing.parentNode) {
                document.body.removeChild(processing);
            }
            
            // Descargar PDF
            console.log('💾 Descargando PDF firmado...');
            this.downloadPdf(pdfBytes, fullName);
            
            // Marcar como impresa para este curso
            console.log('🖨️ Marcando como impresa...');
            const courseDate = this.attendanceDate || new Date().toISOString().split('T')[0];
            
            // Actualizar en Firestore
            if (CONFIG.USE_FIREBASE && db) {
                try {
                    const docRef = db.collection('signatures').doc(signature.id);
                    const doc = await docRef.get();
                    let printedCourses = doc.exists && doc.data().printedCourses ? doc.data().printedCourses : [];
                    
                    if (!printedCourses.includes(courseDate)) {
                        printedCourses.push(courseDate);
                    }
                    
                    await docRef.update({
                        printedCourses: printedCourses,
                        lastPrintedDate: new Date().toISOString(),
                        printed: true,
                        printedDate: new Date().toISOString()
                    });
                    console.log('✅ Estado actualizado en Firestore');
                } catch (firestoreError) {
                    console.warn('⚠️ Error actualizando Firestore:', firestoreError);
                }
            }
            
            // Actualizar en localStorage
            let signatures = JSON.parse(localStorage.getItem('signatures') || '[]');
            const sigIndex = signatures.findIndex(sig => sig.id === signature.id);
            
            if (sigIndex !== -1) {
                if (!signatures[sigIndex].printedCourses) {
                    signatures[sigIndex].printedCourses = [];
                }
                
                if (!signatures[sigIndex].printedCourses.includes(courseDate)) {
                    signatures[sigIndex].printedCourses.push(courseDate);
                }
                
                signatures[sigIndex].lastPrintedDate = new Date().toISOString();
                signatures[sigIndex].printed = true;
                signatures[sigIndex].printedDate = new Date().toISOString();
                
                localStorage.setItem('signatures', JSON.stringify(signatures));
                console.log('✅ Estado actualizado en localStorage');
            }
            
            // Recargar tabla para mostrar el cambio (sin scroll)
            if (document.getElementById('attendanceCheckSection').style.display !== 'none') {
                await this.showAttendanceCheck(this.currentFilterOnlyMissing || false, false);
            }
            
            // Actualizar estadísticas
            await this.updateAttendanceInfo();
            
            console.log(`✅ Constancia descargada y marcada como impresa: ${fullName}`);
            // La descarga y actualización visual son suficientes
            
        } catch (error) {
            console.error('❌ Error completo:', error);
            console.error('❌ Stack:', error.stack);
            
            // Remover indicador si existe
            if (processing && processing.parentNode) {
                document.body.removeChild(processing);
            }
            
            const errorMsg = error.message || 'Error desconocido';
            alert(`❌ Error al procesar la constancia:\n${errorMsg}\n\nRevisa la consola del navegador (F12) para más detalles.`);
        }
    }

    async loadConstancias(files) {
        console.log('🔍 loadConstancias llamada con files:', files);
        
        if (!this.attendanceList || this.attendanceList.length === 0) {
            alert('⚠️ Primero debes cargar la lista de asistencia desde el Excel.');
            return;
        }

        if (!files || files.length === 0) {
            console.warn('⚠️ No se seleccionaron archivos');
            return;
        }

        console.log(`📂 Cargando ${files.length} constancias con OCR...`);
        
        const loadBtn = document.getElementById('loadConstanciasBtnInline');
        const loadBtnText = document.getElementById('loadConstanciasBtnText');
        const progressDiv = document.getElementById('constanciasProgress');
        const progressText = document.getElementById('constanciasProgressText');
        const progressBar = document.getElementById('constanciasProgressBar');
        const originalText = loadBtnText.textContent;
        
        loadBtn.disabled = true;
        loadBtnText.textContent = 'Procesando...';
        progressDiv.style.display = 'block';
        progressBar.style.width = '0%';

        let processedCount = 0;
        let notFoundFiles = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                progressText.textContent = `Escaneando archivo ${i + 1} de ${files.length}...`;
                progressBar.style.width = `${((i + 1) / files.length) * 100}%`;
                console.log(`\n📄 ========== Escaneando (${i + 1}/${files.length}): ${file.name} ==========`);
                
                // Escanear el archivo con OCR
                const scannedText = await this.scanConstanciaForName(file);
                
                if (!scannedText) {
                    console.warn(`⚠️ No se pudo escanear: ${file.name}`);
                    notFoundFiles.push(file.name);
                    continue;
                }

                console.log(`📝 Texto final para búsqueda:`, scannedText.substring(0, 250));
                
                // Buscar coincidencia con alumnos de la lista
                const matchedAlumno = this.findAlumnoInText(scannedText);

                if (matchedAlumno) {
                    // Guardar el archivo en el mapa
                    this.constanciasMap.set(matchedAlumno.normalized, file);
                    console.log(`✅ ASOCIADO: ${file.name} → ${matchedAlumno.name}`);
                    console.log(`   Normalizado: ${matchedAlumno.normalized}`);
                    processedCount++;
                } else {
                    console.warn(`\n❌ NO SE ENCONTRÓ MATCH para: ${file.name}`);
                    console.warn(`   Mejor score obtenido en la búsqueda fue insuficiente`);
                    console.warn(`   Revisa los logs anteriores para ver los scores de cada alumno\n`);
                    notFoundFiles.push(file.name);
                }
            } catch (error) {
                console.error(`❌ Error procesando ${file.name}:`, error);
                notFoundFiles.push(file.name);
            }
        }

        progressDiv.style.display = 'none';
        loadBtn.disabled = false;
        loadBtnText.textContent = originalText;

        // Actualizar contador inline en tabla de cotejo (badge en botón)
        const inlineCounter = document.getElementById('constanciasCountInline');
        inlineCounter.textContent = processedCount;
        if (processedCount > 0) {
            inlineCounter.style.display = 'inline-block';
        } else {
            inlineCounter.style.display = 'none';
        }
        
        // Habilitar botón de imprimir si hay constancias
        document.getElementById('printGestorBtn').disabled = processedCount === 0;

        // Actualizar estadísticas
        await this.updateAttendanceInfo();

        // Solo mostrar alerta si hay archivos no asociados
        if (notFoundFiles.length > 0) {
            let message = `Se cargaron ${processedCount} de ${files.length} constancias.\n\n⚠️ No se pudieron asociar ${notFoundFiles.length} archivos:\n`;
            notFoundFiles.slice(0, 5).forEach(name => {
                message += `• ${name}\n`;
            });
            if (notFoundFiles.length > 5) {
                message += `... y ${notFoundFiles.length - 5} más`;
            }
            alert(message);
        } else {
            console.log(`✅ ${processedCount} constancias cargadas correctamente`);
        }
        
        // Recargar la tabla si está visible (sin scroll)
        if (document.getElementById('attendanceCheckSection').style.display !== 'none') {
            await this.showAttendanceCheck(this.currentFilterOnlyMissing || false, false);
        }
    }

    async scanConstanciaForName(file) {
        try {
            // Convertir archivo a imagen para OCR
            let imageUrl;
            
            if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                // Si es PDF, convertir primera página a imagen
                const arrayBuffer = await file.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);
                
                const scale = 2.0;
                const viewport = page.getViewport({ scale });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;
                
                imageUrl = canvas.toDataURL();
            } else {
                // Si es imagen, usar directamente
                imageUrl = await this.fileToDataURL(file);
            }

            // Realizar OCR
            const result = await Tesseract.recognize(
                imageUrl,
                'spa',
                {
                    logger: () => {} // Silenciar logs
                }
            );

            return result.data.text;
        } catch (error) {
            console.error('Error en OCR:', error);
            return null;
        }
    }

    fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    findAlumnoInText(text) {
        // Normalizar el texto escaneado
        let textNormalized = this.normalizeNameForMatch(text);
        
        // Limpiar espacios múltiples que pueden venir del OCR (ej: "MU   OZ" -> "MUOZ")
        // Esto ayuda cuando el OCR no reconoce caracteres especiales como Ñ
        textNormalized = textNormalized.replace(/\s{2,}/g, '');
        
        // MEJORADO: Juntar fragmentos que probablemente sean parte de una palabra
        // Esto compensa errores de OCR con Ñ que genera espacios inesperados
        
        // 1. Juntar palabras cortas (1-3 letras) con la siguiente
        // Ejemplo: "NU EZ" -> "NUEZ"
        textNormalized = textNormalized.replace(/\b([A-Z]{1,3})\s+([A-Z]{2,})\b/g, '$1$2');
        
        // 2. Juntar palabras que terminan con vocal + palabra corta (2-3 letras)
        // Ejemplo: "VILLASE OR" -> "VILLASEOR", "PE A" -> "PEA"
        textNormalized = textNormalized.replace(/\b([A-Z]+[AEIOU])\s+([A-Z]{2,3})\b/g, '$1$2');
        
        // 3. Juntar cualquier palabra + fragmento de 2 letras si parece apellido
        // Ejemplo: "GARCIA NA" -> "GARCIANA"
        textNormalized = textNormalized.replace(/\b([A-Z]{4,})\s+([A-Z]{2})\b/g, '$1$2');
        
        console.log(`📝 Texto normalizado para matching: ${textNormalized.substring(0, 200)}`);
        
        let bestMatch = null;
        let bestScore = 0;
        const MIN_SCORE = 0.55; // Reducido a 55% para compensar errores graves de OCR
        
        // Buscar cada alumno en el texto
        for (const alumno of this.attendanceList) {
            const nombreNormalizado = alumno.normalized;
            const palabrasAlumno = nombreNormalizado.split(/\s+/).filter(w => w.length > 2);
            
            let score = 0;
            let matchedWords = 0;
            let totalWeight = 0;
            let lastNameBonus = 0;
            
            // Calcular score ponderado
            for (let i = 0; i < palabrasAlumno.length; i++) {
                const palabra = palabrasAlumno[i];
                // Palabras más largas tienen más peso (típicamente apellidos)
                let weight = Math.max(1, palabra.length / 4);
                
                // IMPORTANTE: Si es el segundo apellido (típicamente última palabra), darle peso extra
                // Esto ayuda a confirmar identidad cuando el primer apellido tiene errores de OCR
                if (i === palabrasAlumno.length - 1 && palabrasAlumno.length >= 3) {
                    weight *= 1.5; // 50% más peso al segundo apellido
                    console.log(`  🔍 Segundo apellido detectado: "${palabra}" (peso aumentado)`);
                }
                
                totalWeight += weight;
                
                // Buscar coincidencia exacta o fuzzy
                let isMatch = textNormalized.includes(palabra);
                let matchType = 'exacto';
                
                // Si no hay match exacto, buscar fuzzy (permite 1 carácter de diferencia por cada 4 caracteres)
                if (!isMatch && palabra.length >= 4) {
                    isMatch = this.fuzzyMatchInText(palabra, textNormalized);
                    if (isMatch) matchType = 'fuzzy';
                }
                
                // Si aún no hay match y la palabra es larga (apellido con Ñ), buscar variaciones
                // Ejemplo: "VILLASEÑOR" busca "VILLASEOR", "VILLASE", etc.
                if (!isMatch && palabra.length >= 7) {
                    // Buscar subcadenas largas (mínimo 6 caracteres)
                    const substringToFind = palabra.substring(0, Math.max(6, palabra.length - 2));
                    if (textNormalized.includes(substringToFind)) {
                        isMatch = true;
                        matchType = 'parcial';
                        console.log(`  🔸 Match parcial: "${palabra}" encontrado como "${substringToFind}"`);
                    }
                }
                
                if (isMatch) {
                    matchedWords++;
                    
                    // Bonus por segundo apellido matcheado (muy confiable para confirmar identidad)
                    if (i === palabrasAlumno.length - 1 && palabrasAlumno.length >= 3) {
                        lastNameBonus = 0.3; // 30% bonus si el segundo apellido coincide
                        console.log(`  ✅ Segundo apellido "${palabra}" coincide (${matchType}) - Bonus activado`);
                    }
                    
                    // Bonus si la palabra aparece en orden relativo correcto
                    const posInText = textNormalized.indexOf(palabra);
                    let orderBonus = 0;
                    
                    // Verificar si palabras anteriores también están presentes y en orden
                    if (i > 0) {
                        const palabraAnterior = palabrasAlumno[i - 1];
                        const posAnterior = textNormalized.indexOf(palabraAnterior);
                        if (posAnterior !== -1 && posAnterior < posInText) {
                            orderBonus = 0.2; // 20% bonus por orden correcto
                        }
                    }
                    
                    score += weight * (1 + orderBonus);
                }
            }
            
            // Normalizar score (0 a 1)
            const normalizedScore = score / totalWeight;
            
            // Penalizar si hay muy pocas palabras matched
            const wordMatchRatio = matchedWords / palabrasAlumno.length;
            let finalScore = normalizedScore * (0.5 + wordMatchRatio * 0.5);
            
            // Aplicar bonus por segundo apellido
            finalScore = Math.min(1.0, finalScore * (1 + lastNameBonus));
            
            console.log(`📊 ${alumno.name}: ${(finalScore * 100).toFixed(1)}% (${matchedWords}/${palabrasAlumno.length} palabras)${lastNameBonus > 0 ? ' [+Segundo apellido]' : ''}`);
            
            // Actualizar mejor match
            if (finalScore > bestScore && finalScore >= MIN_SCORE) {
                bestScore = finalScore;
                bestMatch = alumno;
            }
        }
        
        if (bestMatch) {
            console.log(`🎯 Match encontrado: ${bestMatch.name} con ${(bestScore * 100).toFixed(1)}% de similitud`);
        } else {
            console.log(`❌ No se encontró match suficientemente confiable (mejor: ${(bestScore * 100).toFixed(1)}%)`);
        }
        
        return bestMatch;
    }

    fuzzyMatchInText(word, text) {
        // Busca una palabra en el texto permitiendo pequeñas diferencias
        // Útil para errores de OCR como Ñ -> N, O -> 0, etc.
        
        // Aumentar tolerancia: 1 error cada 4 caracteres (más permisivo para Ñ)
        const maxDistance = Math.max(1, Math.floor(word.length / 4));
        const words = text.split(/\s+/);
        
        for (const textWord of words) {
            if (textWord.length === 0) continue;
            
            // Si las longitudes son muy diferentes, saltar (optimización)
            if (Math.abs(word.length - textWord.length) > maxDistance + 1) {
                continue;
            }
            
            // Calcular distancia de Levenshtein
            const distance = this.levenshteinDistance(word, textWord);
            
            if (distance <= maxDistance) {
                console.log(`  ✨ Fuzzy match: "${word}" ≈ "${textWord}" (distancia: ${distance}/${maxDistance})`);
                return true;
            }
        }
        
        return false;
    }

    levenshteinDistance(str1, str2) {
        // Algoritmo de distancia de Levenshtein para medir similitud entre strings
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = [];

        // Inicializar matriz
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }

        // Llenar matriz
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,      // Eliminación
                    matrix[i][j - 1] + 1,      // Inserción
                    matrix[i - 1][j - 1] + cost // Sustitución
                );
            }
        }

        return matrix[len1][len2];
    }

    matchNames(name1, name2) {
        // Comparar palabras individuales para mayor flexibilidad
        const words1 = name1.split(/\s+/).filter(w => w.length > 2);
        const words2 = name2.split(/\s+/).filter(w => w.length > 2);
        
        let matches = 0;
        for (const word1 of words1) {
            for (const word2 of words2) {
                if (word1.includes(word2) || word2.includes(word1)) {
                    matches++;
                }
            }
        }
        
        // Si coinciden al menos 2 palabras, considerar match
        return matches >= 2;
    }

    async printByGestor() {
        if (!this.representantSignature) {
            alert('⚠️ Configura la firma del representante primero');
            return;
        }

        const selectedGestor = this.selectedGestor;
        if (selectedGestor === 'TODOS') {
            if (!confirm('⚠️ Estás por imprimir TODAS las constancias de TODOS los gestores.\n\n¿Deseas continuar?')) {
                return;
            }
        }

        // Filtrar lista por gestor
        const filteredList = selectedGestor === 'TODOS' 
            ? this.attendanceList 
            : this.attendanceList.filter(item => item.gestor === selectedGestor);
        
        // Obtener TODAS las firmas (no solo de hoy)
        const allSignatures = await this.getAllSignatures();
        
        // Filtrar solo los que tienen constancia cargada Y tienen firma
        const alumnosToProcess = [];
        const courseDate = this.attendanceDate || new Date().toISOString().split('T')[0];
        
        for (const alumno of filteredList) {
            const hasConstancia = this.constanciasMap.has(alumno.normalized);
            
            if (hasConstancia) {
                // Buscar si tiene firma (en cualquier fecha)
                const signature = allSignatures.find(sig => {
                    const sigNormalized = this.normalizeNameForMatch(sig.fullName);
                    return sigNormalized === alumno.normalized;
                });
                
                if (signature) {
                    // Verificar si ya fue impresa para ESTE curso
                    const printedCourses = signature.printedCourses || [];
                    const isAlreadyPrinted = printedCourses.includes(courseDate);
                    
                    if (!isAlreadyPrinted) {
                        alumnosToProcess.push({
                            alumno: alumno,
                            signature: signature,
                            constanciaFile: this.constanciasMap.get(alumno.normalized)
                        });
                    }
                }
            }
        }

        if (alumnosToProcess.length === 0) {
            alert(`⚠️ No hay constancias listas para imprimir del gestor "${selectedGestor}".\n\nAsegúrate de que:\n• Los alumnos tengan constancia cargada\n• Los alumnos hayan firmado\n• No estén marcadas como ya impresas`);
            return;
        }

        if (!confirm(`🖨️ Se imprimirán ${alumnosToProcess.length} constancias del gestor "${selectedGestor}".\n\n¿Deseas continuar?`)) {
            return;
        }

        const btn = document.getElementById('printGestorBtn');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Procesando...';

        try {
            const signedPdfs = [];
            const processedSignatureIds = [];
            const failedItems = [];

            for (let i = 0; i < alumnosToProcess.length; i++) {
                const item = alumnosToProcess[i];
                console.log(`📝 Procesando ${i + 1}/${alumnosToProcess.length}: ${item.alumno.name}`);

                try {
                    // Procesar constancia
                    const signedPdf = await this.processConstanciaWithSignature(
                        item.constanciaFile,
                        item.signature
                    );

                    signedPdfs.push(signedPdf);
                    processedSignatureIds.push(item.signature.id);
                } catch (itemError) {
                    console.error(`❌ Error con ${item.alumno.name}:`, itemError);
                    failedItems.push({
                        nombre: item.alumno.name,
                        error: itemError.message,
                        fecha: item.signature.timestamp ? new Date(item.signature.timestamp).toLocaleDateString() : 'Desconocida'
                    });
                }
            }

            // Si todas fallaron, detener
            if (signedPdfs.length === 0) {
                let errorMsg = '❌ No se pudo procesar ninguna constancia.\n\n';
                errorMsg += 'Problemas encontrados:\n\n';
                failedItems.forEach(item => {
                    errorMsg += `• ${item.nombre} (${item.fecha})\n  ${item.error}\n\n`;
                });
                alert(errorMsg);
                return;
            }

            // Combinar todos los PDFs exitosos
            console.log(`📁 Combinando ${signedPdfs.length} PDFs...`);
            const combinedPdf = await this.combinePdfs(signedPdfs);
            
            const gestorName = selectedGestor === 'TODOS' ? 'TODOS' : selectedGestor;
            const fileName = `Constancias_${gestorName}_${new Date().toISOString().split('T')[0]}.pdf`;
            this.downloadPdf(combinedPdf, fileName);

            // Marcar como impresas solo las exitosas
            for (const signatureId of processedSignatureIds) {
                await this.markAsPrinted(signatureId);
            }

            // Actualizar estadísticas
            await this.updateAttendanceInfo();

            // Solo mostrar alerta si hay problemas
            if (failedItems.length > 0) {
                let errorMsg = `Proceso completado con ${failedItems.length} advertencias:\n\n`;
                failedItems.forEach(item => {
                    errorMsg += `• ${item.nombre} (${item.fecha})\n`;
                });
                alert(errorMsg);
            } else {
                console.log(`✅ ${signedPdfs.length} constancias procesadas correctamente`);
            }

            // Recargar tabla (sin scroll)
            await this.showAttendanceCheck(this.currentFilterOnlyMissing || false, false);

        } catch (error) {
            console.error('❌ Error:', error);
            alert('❌ Error al procesar constancias: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    async exportMissingSignatures() {
        if (!this.attendanceList || this.attendanceList.length === 0) {
            alert('⚠️ Primero debes cargar la lista de asistencia desde el Excel.');
            return;
        }

        const selectedGestor = this.selectedGestor;
        
        // Filtrar lista por gestor
        const filteredList = selectedGestor === 'TODOS' 
            ? this.attendanceList 
            : this.attendanceList.filter(item => item.gestor === selectedGestor);
        
        // Obtener TODAS las firmas
        const allSignatures = await this.getAllSignatures();
        
        // Encontrar los que NO tienen firma
        const missingSignatures = [];
        
        for (const alumno of filteredList) {
            // Buscar si tiene firma
            const signature = allSignatures.find(sig => {
                const sigNormalized = this.normalizeNameForMatch(sig.fullName);
                return sigNormalized === alumno.normalized;
            });
            
            if (!signature) {
                missingSignatures.push({
                    nombre: alumno.name,
                    gestor: alumno.gestor
                });
            }
        }

        if (missingSignatures.length === 0) {
            alert(`✅ ¡Excelente! No hay personas faltantes de firmar del gestor "${selectedGestor}".`);
            return;
        }

        // Crear CSV
        let csvContent = '\uFEFF'; // BOM para UTF-8
        csvContent += 'Nombre Completo,Gestor\n';
        
        missingSignatures.forEach(person => {
            // Escapar comas y comillas en los datos
            const nombre = `"${person.nombre.replace(/"/g, '""')}"`;
            const gestor = `"${person.gestor.replace(/"/g, '""')}"`;
            csvContent += `${nombre},${gestor}\n`;
        });

        // Crear y descargar archivo
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const gestorName = selectedGestor === 'TODOS' ? 'TODOS' : selectedGestor;
        const dateStr = new Date().toISOString().split('T')[0];
        a.download = `Faltantes_${gestorName}_${dateStr}.csv`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert(`📥 Archivo exportado exitosamente\n\n✓ Gestor: ${selectedGestor}\n✓ Personas faltantes: ${missingSignatures.length}\n✓ Archivo: Faltantes_${gestorName}_${dateStr}.csv`);
    }

    async processConstanciaWithSignature(file, signature) {
        try {
            // Validar que el archivo existe y tiene contenido
            if (!file || !file.size) {
                throw new Error(`Archivo vacío o inválido para ${signature.fullName}`);
            }

            console.log(`📄 Procesando constancia de ${signature.fullName} - Tamaño: ${file.size} bytes`);

            // Leer archivo con validación
            const arrayBuffer = await file.arrayBuffer();
            
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                throw new Error(`El archivo de constancia para ${signature.fullName} está vacío`);
            }

            // Validar que hay suficientes bytes para leer el header
            if (arrayBuffer.byteLength < 5) {
                throw new Error(`El archivo de constancia para ${signature.fullName} es demasiado pequeño (${arrayBuffer.byteLength} bytes)`);
            }

            const header = new Uint8Array(arrayBuffer.slice(0, 5));
            const headerStr = String.fromCharCode(...header);

            let imageData;
            let pageWidth, pageHeight;

            // Si es imagen, convertir a canvas
            if (!headerStr.startsWith('%PDF')) {
                console.log(`🖼️ Procesando como imagen: ${file.name}`);
                const blob = new Blob([arrayBuffer]);
                const imageUrl = URL.createObjectURL(blob);
                const img = new Image();
                
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () => reject(new Error(`No se pudo cargar la imagen para ${signature.fullName}`));
                    img.src = imageUrl;
                });

                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                imageData = canvas.toDataURL('image/png');
                pageWidth = img.width;
                pageHeight = img.height;
                
                URL.revokeObjectURL(imageUrl);
            }

            // Crear PDF firmado
            const pdfDoc = await PDFLib.PDFDocument.create();
            let page;

            if (imageData) {
                // Usar imagen
                let backgroundImage;
                if (imageData.includes('data:image/png')) {
                    const imgBytes = this.dataURLToArrayBuffer(imageData);
                    backgroundImage = await pdfDoc.embedPng(imgBytes);
                } else {
                    const imgBytes = this.dataURLToArrayBuffer(imageData);
                    backgroundImage = await pdfDoc.embedJpg(imgBytes);
                }
                
                pageWidth = backgroundImage.width;
                pageHeight = backgroundImage.height;
                page = pdfDoc.addPage([pageWidth, pageHeight]);
                page.drawImage(backgroundImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });
            } else {
                console.log(`📑 Procesando como PDF: ${file.name}`);
                // Copiar PDF existente con validación
                const existingPdf = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                const pages = existingPdf.getPages();
                
                if (!pages || pages.length === 0) {
                    throw new Error(`El PDF de constancia para ${signature.fullName} no tiene páginas`);
                }
                
                pageWidth = pages[0].getWidth();
                pageHeight = pages[0].getHeight();
                
                const [copiedPage] = await pdfDoc.copyPages(existingPdf, [0]);
                pdfDoc.addPage(copiedPage);
                page = pdfDoc.getPages()[0];
            }

            // Embedear firmas
            const userSigImage = await this.embedImage(pdfDoc, signature.signature);
            const repSigImage = await this.embedImage(pdfDoc, this.representantSignature);

            // Calcular escala
            const BASE_WIDTH = 1000;
            const scale = pageWidth / BASE_WIDTH;

            // Dibujar firmas
            page.drawImage(userSigImage, {
                x: this.COORDENADAS.usuario.x * scale,
                y: pageHeight - (this.COORDENADAS.usuario.y * scale) - (this.COORDENADAS.usuario.alto * scale),
                width: this.COORDENADAS.usuario.ancho * scale,
                height: this.COORDENADAS.usuario.alto * scale,
            });

            page.drawImage(repSigImage, {
                x: this.COORDENADAS.representante.x * scale,
                y: pageHeight - (this.COORDENADAS.representante.y * scale) - (this.COORDENADAS.representante.alto * scale),
                width: this.COORDENADAS.representante.ancho * scale,
                height: this.COORDENADAS.representante.alto * scale,
            });

            return await pdfDoc.save();
        } catch (error) {
            console.error(`❌ Error procesando constancia para ${signature.fullName}:`, error);
            throw new Error(`Error al procesar constancia de ${signature.fullName}: ${error.message}`);
        }
    }

    async markAsPrinted(signatureId) {
        try {
            const courseDate = this.attendanceDate || new Date().toISOString().split('T')[0];
            console.log(`🖨️ Marcando como impresa: ${signatureId} para curso del ${courseDate}`);
            
            // Actualizar en Firestore
            if (CONFIG.USE_FIREBASE && db) {
                try {
                    const docRef = db.collection('signatures').doc(signatureId);
                    const doc = await docRef.get();
                    const printedCourses = doc.exists && doc.data().printedCourses ? doc.data().printedCourses : [];
                    
                    if (!printedCourses.includes(courseDate)) {
                        printedCourses.push(courseDate);
                    }
                    
                    await docRef.update({
                        printedCourses: printedCourses,
                        lastPrintedDate: new Date().toISOString(),
                        // Mantener compatibilidad con código anterior
                        printed: true,
                        printedDate: new Date().toISOString()
                    });
                    console.log(`✅ Curso ${courseDate} marcado como impreso en Firestore`);
                } catch (firestoreError) {
                    console.error('❌ Error actualizando Firestore:', firestoreError);
                }
            }
            
            // Actualizar en localStorage
            let signatures = JSON.parse(localStorage.getItem('signatures') || '[]');
            const sigIndex = signatures.findIndex(sig => sig.id === signatureId);
            
            if (sigIndex !== -1) {
                if (!signatures[sigIndex].printedCourses) {
                    signatures[sigIndex].printedCourses = [];
                }
                
                if (!signatures[sigIndex].printedCourses.includes(courseDate)) {
                    signatures[sigIndex].printedCourses.push(courseDate);
                }
                
                signatures[sigIndex].lastPrintedDate = new Date().toISOString();
                // Mantener compatibilidad
                signatures[sigIndex].printed = true;
                signatures[sigIndex].printedDate = new Date().toISOString();
                
                localStorage.setItem('signatures', JSON.stringify(signatures));
                console.log(`✅ Curso ${courseDate} marcado como impreso en localStorage`);
            }
            
        } catch (error) {
            console.error('❌ Error al marcar como impresa:', error);
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
