// admin-simple.js - Versión Optimizada para Constancias SCT
// Inicializar Firebase
let db;
if (CONFIG.USE_FIREBASE && typeof firebase !== 'undefined') {
    firebase.initializeApp(CONFIG.firebase);
    db = firebase.firestore();
    console.log('✅ Firebase inicializado en admin');
}

// Sistema de firmado de PDFs - Modo Local (sin servidor) con OCR Zonal
class SimpleAdminPDF {
    constructor() {
        this.currentPdfBytes = null;
        this.currentPdfFile = null;
        this.currentImageData = null; 
        this.currentSignature = null;
        this.representantSignature = null;
        this.extractedText = '';
        this.filesQueue = []; 
        this.processedFiles = []; 
        
        // Configuración de Zonas de Lectura (Porcentajes relativos al tamaño de la hoja)
        // Basado en la Constancia de Capacitación SCT
        this.OCR_ZONES = {
            name: { x: 0.10, y: 0.32, w: 0.80, h: 0.10 }, // El nombre está al 32% de altura
            curp: { x: 0.10, y: 0.42, w: 0.80, h: 0.08 }  // La CURP está al 42% de altura
        };

        // Coordenadas de estampado de firma (Ajustables)
        this.COORDENADAS = {
            usuario: { x: 171, y: 1150, ancho: 400, alto: 200 },
            representante: { x: 650, y: 1130, ancho: 500, alto: 200 }
        };
        
        this.init();
    }

    init() {
        this.loadRepresentantSignature();
        
        // Event Listeners
        document.getElementById('configRepBtn').addEventListener('click', () => this.toggleRepConfig());
        const uploadArea = document.getElementById('repUploadArea');
        const fileInput = document.getElementById('repSignatureFile');
        
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.background = '#e0f2fe'; });
        uploadArea.addEventListener('dragleave', () => { uploadArea.style.background = ''; });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault(); uploadArea.style.background = '';
            if (e.dataTransfer.files[0]) this.handleRepSignatureFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => { if (e.target.files[0]) this.handleRepSignatureFile(e.target.files[0]); });
        document.getElementById('saveRepBtn').addEventListener('click', () => this.saveRepresentantSignature());
        document.getElementById('pdfFile').addEventListener('change', (e) => { if (e.target.files.length > 0) this.handleMultipleFiles(e.target.files); });
        document.getElementById('processAllBtn').addEventListener('click', () => this.processAllFiles());
        document.getElementById('searchSignatureBtn').addEventListener('click', () => this.searchSignature());
        document.getElementById('signPdfBtn').addEventListener('click', () => this.signPdf());
        document.getElementById('viewSignaturesBtn').addEventListener('click', () => this.showSignaturesList());
        document.getElementById('closeSignaturesBtn').addEventListener('click', () => { document.getElementById('signaturesListSection').style.display = 'none'; });
        document.getElementById('searchBtn').addEventListener('click', () => this.searchSignatures());
        document.getElementById('searchInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') this.searchSignatures(); });

        this.updateStats();
    }

    toggleRepConfig() {
        const config = document.getElementById('representantConfig');
        config.style.display = config.style.display === 'none' ? 'block' : 'none';
    }

    handleRepSignatureFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('repPreviewImg').src = e.target.result;
            document.getElementById('repSignaturePreview').style.display = 'block';
            document.getElementById('saveRepBtn').disabled = false;
            this.representantSignature = e.target.result;
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
            currentDiv.innerHTML = `<div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; padding: 15px;"><h4>Firma actual:</h4><img src="${saved}" style="max-width: 250px; display: block; margin: 10px auto;"></div>`;
            this.representantSignature = saved;
        } else {
            currentDiv.innerHTML = `<div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; padding: 15px;"><p style="color: #dc2626; margin: 0;">⚠️ No hay firma configurada</p></div>`;
        }
        this.updateStats();
    }

    handleMultipleFiles(files) {
        if (files.length === 1) { this.processFile(files[0]); return; }
        this.filesQueue = [];
        this.processedFiles = [];
        Array.from(files).forEach(file => {
            this.filesQueue.push({ file: file, status: 'pending', name: file.name, signature: null, pdfBytes: null, imageData: null });
        });
        this.displayFilesQueue();
        document.getElementById('filesQueueSection').style.display = 'block';
    }

    displayFilesQueue() {
        const queueContainer = document.getElementById('filesQueue');
        document.getElementById('queueCount').textContent = this.filesQueue.length;
        queueContainer.innerHTML = '';
        this.filesQueue.forEach((item) => {
            const statusConfig = {
                'pending': { icon: '⏳', text: 'Pendiente', color: '#6b7280' },
                'processing': { icon: '🔄', text: 'Procesando...', color: '#3b82f6' },
                'completed': { icon: '✅', text: 'Completado', color: '#10b981' },
                'error': { icon: '❌', text: 'Error', color: '#ef4444' }
            };
            const s = statusConfig[item.status] || statusConfig['pending'];
            const card = document.createElement('div');
            card.style.cssText = 'background: white; padding: 12px; border-radius: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;';
            card.innerHTML = `<div style="flex: 1;"><strong>${item.name}</strong>${item.signature ? `<br><small style="color: #666;">Firma: ${item.signature.fullName}</small>` : ''}</div><div style="color: ${s.color}; font-weight: bold;">${s.icon} ${s.text}</div>`;
            queueContainer.appendChild(card);
        });
    }

    async processAllFiles() {
        if (!this.representantSignature) { alert('⚠️ Configura la firma del representante primero'); return; }
        const btn = document.getElementById('processAllBtn');
        btn.disabled = true;
        btn.textContent = '⏳ Procesando...';
        const signedPdfs = [];

        for (let i = 0; i < this.filesQueue.length; i++) {
            const item = this.filesQueue[i];
            if (item.status === 'completed') continue;
            item.status = 'processing';
            this.displayFilesQueue();
            try {
                await this.processSingleFileInQueue(item, false);
                item.status = 'completed';
                this.processedFiles.push(item);
                signedPdfs.push(item.signedPdfBytes);
            } catch (error) {
                console.error(`Error en ${item.name}:`, error);
                item.status = 'error';
                item.errorMessage = error.message;
            }
            this.displayFilesQueue();
        }

        btn.disabled = false;
        btn.textContent = '⚡ Procesar Todos los Archivos';
        const completed = this.filesQueue.filter(f => f.status === 'completed').length;
        
        if (completed > 0) {
            try {
                const combinedPdf = await this.combinePdfs(signedPdfs);
                const today = new Date().toISOString().split('T')[0];
                this.downloadPdf(combinedPdf, `Lote_Constancias_${today}.pdf`);
                alert(`✅ Proceso completado: ${completed} archivos firmados.`);
            } catch (error) {
                console.error('Error combinando:', error);
                alert('⚠️ Se firmaron los archivos pero falló la combinación.');
            }
        }
    }

    async processSingleFileInQueue(item) {
        // Carga y renderizado inicial
        const arrayBuffer = await item.file.arrayBuffer();
        const header = String.fromCharCode(...new Uint8Array(arrayBuffer.slice(0, 5)));
        
        let rawCanvas;
        
        if (!header.startsWith('%PDF')) {
            // Imagen
            rawCanvas = await this.imageToCanvas(arrayBuffer);
            item.imageData = rawCanvas.toDataURL('image/png');
        } else {
            // PDF
            item.pdfBytes = new Uint8Array(arrayBuffer);
            rawCanvas = await this.pdfToCanvas(arrayBuffer);
            item.imageData = rawCanvas.toDataURL('image/png');
        }

        // --- ESTRATEGIA HÍBRIDA: ZONAL + FULL ---
        console.log(`🔍 Iniciando escaneo inteligente para: ${item.name}`);
        
        // 1. Intentar OCR Zonal (Rápido y preciso para Constancias SCT)
        const zonalData = await this.scanZones(rawCanvas);
        let name = zonalData.name;
        let doc = zonalData.curp;

        // 2. Si falla Zonal, intentar Full Page (Lento pero seguro)
        if (!doc) {
            console.log("⚠️ Zonal falló, intentando escaneo completo...");
            // Usamos la imagen preprocesada completa
            const processedFullImg = await this.preprocessImageForOCR(rawCanvas.toDataURL());
            const worker = await Tesseract.createWorker('spa', 1);
            const { data: { text } } = await worker.recognize(processedFullImg);
            await worker.terminate();
            
            name = this.extractNameFromText(text);
            doc = this.extractDocumentFromText(text);
        }

        console.log(`📊 Datos finales detectados en ${item.name}:`, { nombre: name, documento: doc });

        // Búsqueda de firma
        const signature = await this.findSignatureInDb(name, doc);
        
        if (!signature) {
            throw new Error(`Firma no encontrada para: ${name || 'Desconocido'} (${doc || 'Sin DOC'})`);
        }

        item.signature = signature;
        item.signedPdfBytes = await this.signPdfForQueue(item);
    }

    // --- FUNCIONES DE OCR MEJORADAS ---

    async scanZones(fullCanvas) {
        const worker = await Tesseract.createWorker('spa', 1);
        const w = fullCanvas.width;
        const h = fullCanvas.height;
        
        // Función auxiliar para procesar una zona
        const processZone = async (zoneDef, label) => {
            const zCanvas = document.createElement('canvas');
            zCanvas.width = w * zoneDef.w;
            zCanvas.height = h * zoneDef.h;
            const zCtx = zCanvas.getContext('2d');
            
            // Recortar
            zCtx.drawImage(fullCanvas, 
                w * zoneDef.x, h * zoneDef.y, w * zoneDef.w, h * zoneDef.h, // Source
                0, 0, zCanvas.width, zCanvas.height // Destination
            );

            // Binarización "Hard" para quitar escudo
            const imgData = zCtx.getImageData(0, 0, zCanvas.width, zCanvas.height);
            const d = imgData.data;
            const threshold = 175; // Umbral agresivo para borrar gris
            
            for (let i = 0; i < d.length; i += 4) {
                const avg = (d[i] + d[i+1] + d[i+2]) / 3;
                const val = avg < threshold ? 0 : 255;
                d[i] = d[i+1] = d[i+2] = val;
            }
            zCtx.putImageData(imgData, 0, 0);

            // Reconocer
            const { data: { text } } = await worker.recognize(zCanvas.toDataURL());
            return text;
        };

        const rawName = await processZone(this.OCR_ZONES.name, 'NOMBRE');
        const rawCurp = await processZone(this.OCR_ZONES.curp, 'CURP');
        
        await worker.terminate();

        // Limpieza específica
        return {
            name: this.extractNameFromText(rawName),
            curp: this.extractDocumentFromText(rawCurp)
        };
    }

    // Binarización para imagen completa (Fallback)
    preprocessImageForOCR(imageDataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                const threshold = 165; 
                
                for (let i = 0; i < data.length; i += 4) {
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    const val = avg < threshold ? 0 : 255;
                    data[i] = data[i + 1] = data[i + 2] = val;
                }
                
                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.src = imageDataUrl;
        });
    }

    // --- UTILIDADES DE CARGA ---

    imageToCanvas(arrayBuffer) {
        return new Promise((resolve) => {
            const blob = new Blob([arrayBuffer]);
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(img.src);
                resolve(canvas);
            };
            img.src = URL.createObjectURL(blob);
        });
    }

    async pdfToCanvas(arrayBuffer) {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
        return canvas;
    }

    // --- LÓGICA DE EXTRACCIÓN Y BÚSQUEDA ---

    async findSignatureInDb(name, doc) {
        const signatures = await this.getAllSignatures();
        const searchName = (name || '').toLowerCase().trim();
        const searchDoc = (doc || '').toLowerCase().trim();
        const searchDocNorm = this.normalizeDocument(searchDoc);

        return signatures.find(sig => {
            const sigName = (sig.fullName || '').toLowerCase().trim();
            const sigDoc = (sig.document || '').toLowerCase().trim();
            const sigDocNorm = this.normalizeDocument(sigDoc);

            // 1. Coincidencia CURP (Prioridad Máxima)
            if (searchDocNorm && sigDocNorm) {
                if (sigDocNorm === searchDocNorm || sigDocNorm.includes(searchDocNorm)) return true;
            }

            // 2. Coincidencia Nombre
            if (searchName && sigName) {
                if (sigName === searchName) return true;
                // Coincidencia parcial robusta (mínimo 2 palabras largas coinciden)
                const sWords = searchName.split(/\s+/).filter(w => w.length > 3);
                const dbWords = sigName.split(/\s+/).filter(w => w.length > 3);
                const matches = sWords.filter(w => dbWords.some(dbW => dbW.includes(w) || w.includes(dbW))).length;
                if (matches >= 2) return true;
            }
            return false;
        });
    }

    extractNameFromText(text) {
        // Filtrar líneas vacías y cortas
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
        
        // Regex tolerante: Permite letras, espacios y el error común de OCR donde la Ñ es un espacio
        // Ej: "ALFONSO BRISE O ALVARADO"
        // Ignora palabras clave del documento
        const blacklist = ['CONSTANCIA', 'CAPACITACIÓN', 'FEDERAL', 'TRANSPORTE', 'SECRETARIA', 'MEXICANOS'];
        
        // Busca línea en mayúsculas que NO tenga palabras de la lista negra
        for (const line of lines) {
            const isUpper = /^[A-ZÁÉÍÓÚÑ\s]+$/.test(line.replace(/\s+/g, '')); // Check si es solo mayúsculas
            if (isUpper && line.length > 15 && !blacklist.some(b => line.includes(b))) {
                return line.trim();
            }
        }
        return '';
    }

    extractDocumentFromText(text) {
        // Limpiar texto para facilitar búsqueda regex
        const cleanText = text.replace(/[:;]/g, ' ').toUpperCase();
        
        // Regex CURP Estricto
        const curpRegex = /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/;
        const match = cleanText.match(curpRegex);
        if (match) return this.normalizeDocument(match[0]);

        // Regex RFC (Fallback)
        const rfcRegex = /[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}/;
        const rfcMatch = cleanText.match(rfcRegex);
        if (rfcMatch) return rfcMatch[0];

        return '';
    }

    normalizeDocument(doc) {
        if (!doc) return '';
        let normalized = doc.toUpperCase().replace(/\s+/g, '');
        // Correcciones comunes de OCR (0 vs O, 1 vs I) para CURPs
        if (normalized.length === 18) {
            const chars = normalized.split('');
            // Corregir Fecha (pos 4-9 deben ser números)
            for (let i = 4; i < 10; i++) {
                if (chars[i] === 'O') chars[i] = '0';
                if (chars[i] === 'I' || chars[i] === 'L') chars[i] = '1';
                if (chars[i] === 'B') chars[i] = '8';
            }
            normalized = chars.join('');
        }
        return normalized;
    }

    // --- FIRMADO Y GUARDADO ---

    async signPdfForQueue(item) {
        const pdfDoc = await PDFLib.PDFDocument.create();
        let page, pageWidth, pageHeight;

        // Crear página base (desde imagen siempre para consistencia visual)
        const imgBytes = this.dataURLToArrayBuffer(item.imageData);
        const embeddedImage = await pdfDoc.embedPng(imgBytes);
        pageWidth = embeddedImage.width;
        pageHeight = embeddedImage.height;
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawImage(embeddedImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });

        // Insertar firmas
        const userSigImg = await this.embedImage(pdfDoc, item.signature.signature);
        const repSigImg = await this.embedImage(pdfDoc, this.representantSignature);

        page.drawImage(userSigImg, {
            x: this.COORDENADAS.usuario.x,
            y: pageHeight - this.COORDENADAS.usuario.y - this.COORDENADAS.usuario.alto,
            width: this.COORDENADAS.usuario.ancho,
            height: this.COORDENADAS.usuario.alto,
        });

        page.drawImage(repSigImg, {
            x: this.COORDENADAS.representante.x,
            y: pageHeight - this.COORDENADAS.representante.y - this.COORDENADAS.representante.alto,
            width: this.COORDENADAS.representante.ancho,
            height: this.COORDENADAS.representante.alto,
        });

        return await pdfDoc.save();
    }

    // --- FUNCIONES INTERFAZ USUARIO (UI) ---

    async processFile(file) {
        document.getElementById('scanningSection').style.display = 'block';
        document.getElementById('personDataSection').style.display = 'none';
        document.getElementById('signatureFound').style.display = 'none';
        document.getElementById('noSignature').style.display = 'none';
        
        // Creamos un item temporal similar al de la cola
        const item = { file: file, name: file.name, status: 'pending' };
        
        try {
            await this.processSingleFileInQueue(item);
            
            // Si tiene éxito, actualizamos la UI Manual
            document.getElementById('personName').value = item.signature.fullName;
            document.getElementById('personDoc').value = item.signature.document;
            this.currentSignature = item.signature;
            this.currentPdfBytes = null; // Usamos imageData
            this.currentImageData = item.imageData;
            
            // Simular clic en botón de búsqueda para mostrar resultado visual
            document.getElementById('foundSignature').src = item.signature.signature;
            document.getElementById('foundName').textContent = `${item.signature.fullName}`;
            document.getElementById('signatureFound').style.display = 'block';
            document.getElementById('scanningSection').style.display = 'none';
            document.getElementById('personDataSection').style.display = 'block';

        } catch (error) {
            console.error(error);
            alert('⚠️ No se encontró la firma automáticamente. Revisa los datos manuales.');
            document.getElementById('scanningSection').style.display = 'none';
            document.getElementById('personDataSection').style.display = 'block';
        }
    }

    // Funciones auxiliares existentes se mantienen (getAllSignatures, etc.)
    async getAllSignatures() {
        let signatures = [];
        if (CONFIG.USE_FIREBASE && db) {
            const snap = await db.collection('signatures').get();
            snap.forEach(doc => signatures.push(doc.data()));
        } else {
            signatures = JSON.parse(localStorage.getItem('signatures') || '[]');
        }
        return signatures;
    }
    
    // UI Helpers (Search, Sign Manual, Etc) - Simplificado para brevedad, lógica igual
    async searchSignature() {
        const name = document.getElementById('personName').value;
        const doc = document.getElementById('personDoc').value;
        const sig = await this.findSignatureInDb(name, doc);
        if (sig) {
            this.currentSignature = sig;
            document.getElementById('foundSignature').src = sig.signature;
            document.getElementById('foundName').textContent = sig.fullName;
            document.getElementById('signatureFound').style.display = 'block';
            document.getElementById('noSignature').style.display = 'none';
        } else {
            document.getElementById('signatureFound').style.display = 'none';
            document.getElementById('noSignature').style.display = 'block';
        }
    }

    async signPdf() {
        if (!this.currentSignature || !this.representantSignature) return alert('Faltan firmas');
        const item = { 
            imageData: this.currentImageData, 
            signature: this.currentSignature 
        };
        const pdfBytes = await this.signPdfForQueue(item);
        this.downloadPdf(pdfBytes, this.currentSignature.fullName);
    }

    async selectSignatureForSigning(id) {
        const sigs = await this.getAllSignatures();
        const found = sigs.find(s => s.id === id);
        if (found) {
            this.currentSignature = found;
            document.getElementById('personName').value = found.fullName;
            document.getElementById('personDoc').value = found.document;
            document.getElementById('foundSignature').src = found.signature;
            document.getElementById('signatureFound').style.display = 'block';
            document.querySelector('.card h2').scrollIntoView({ behavior: 'smooth' });
        }
    }
    
    // Helpers de utilería
    async embedImage(pdfDoc, base64) {
        const bytes = this.base64ToArrayBuffer(base64.split(',')[1]);
        return base64.startsWith('data:image/png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
    }
    base64ToArrayBuffer(base64) {
        const bin = window.atob(base64);
        const len = bin.length;
        const bytes = new Uint8Array(len);
        for (let i=0; i<len; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }
    dataURLToArrayBuffer(url) { return this.base64ToArrayBuffer(url.split(',')[1]); }
    
    async combinePdfs(arrays) {
        const doc = await PDFLib.PDFDocument.create();
        for (const bytes of arrays) {
            const src = await PDFLib.PDFDocument.load(bytes);
            const pages = await doc.copyPages(src, src.getPageIndices());
            pages.forEach(p => doc.addPage(p));
        }
        return await doc.save();
    }
    
    downloadPdf(bytes, name) {
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Firmado_${name.replace(/\s+/g,'_')}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }
    
    // Funciones de vista y estadísticas
    async showSignaturesList() {
        const sigs = await this.getAllSignatures();
        const list = document.getElementById('signaturesList');
        document.getElementById('signaturesListSection').style.display = 'block';
        list.innerHTML = sigs.map(s => `
            <div style="border:1px solid #ddd; padding:10px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; background:white;">
                <div><strong>${s.fullName}</strong><br><small>${s.document}</small></div>
                <img src="${s.signature}" style="height:40px;">
                <button onclick="adminPDF.deleteSignature('${s.id}')" style="background:#ef4444; color:white; border:none; padding:5px 10px; border-radius:4px;">🗑️</button>
            </div>
        `).join('') || '<p>No hay firmas</p>';
    }
    
    async deleteSignature(id) {
        if(!confirm('¿Eliminar?')) return;
        let sigs = JSON.parse(localStorage.getItem('signatures')||'[]');
        sigs = sigs.filter(s => s.id !== id);
        localStorage.setItem('signatures', JSON.stringify(sigs));
        this.showSignaturesList();
        this.updateStats();
    }
    
    async updateStats() {
        const sigs = await this.getAllSignatures();
        document.getElementById('totalSignatures').textContent = sigs.length;
        document.getElementById('repSignatureStatus').textContent = localStorage.getItem('representant_signature') ? '✅' : '❌';
    }

    // Búsqueda para UI manual
    async searchSignatures() {
        const term = document.getElementById('searchInput').value.toLowerCase();
        const sigs = await this.getAllSignatures();
        const res = sigs.filter(s => s.fullName.toLowerCase().includes(term) || s.document.toLowerCase().includes(term));
        this.displaySearchResults(res);
    }

    displaySearchResults(res) {
        const html = res.map(s => `
            <div style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                <div><strong>${s.fullName}</strong> (${s.document})</div>
                <button onclick="adminPDF.selectSignatureForSigning('${s.id}')" class="btn btn-primary">Seleccionar</button>
            </div>
        `).join('') || '<p>Sin resultados</p>';
        document.getElementById('searchResultsList').innerHTML = html;
        document.getElementById('searchResults').style.display = 'block';
    }
}

// Inicialización segura
document.addEventListener('DOMContentLoaded', () => {
    const check = setInterval(() => {
        if (typeof PDFLib !== 'undefined' && typeof Tesseract !== 'undefined' && typeof pdfjsLib !== 'undefined') {
            clearInterval(check);
            window.adminPDF = new SimpleAdminPDF();
            console.log('🚀 Sistema cargado');
        }
    }, 200);
});