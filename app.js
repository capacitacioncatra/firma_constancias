// Inicializar Firebase
let db;
if (CONFIG.USE_FIREBASE && typeof firebase !== 'undefined') {
    firebase.initializeApp(CONFIG.firebase);
    db = firebase.firestore();
    console.log('✅ Firebase inicializado correctamente');
}

// Signature Canvas Manager
class SignatureCapture {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.hasSignature = false;
        this.currentColor = '#000000';
        this.strokes = [];
        this.currentStroke = [];
        
        this.setupCanvas();
        this.setupEventListeners();
    }

    setupCanvas() {
        // Set canvas size to match container
        const container = this.canvas.parentElement;
        this.canvas.width = container.offsetWidth;
        this.canvas.height = container.offsetHeight;
        
        // Set drawing context properties
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());

        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startDrawing(e.touches[0]);
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.draw(e.touches[0]);
        });
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopDrawing();
        });

        // Resize handler
        window.addEventListener('resize', () => this.handleResize());
    }

    getCoordinates(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    startDrawing(event) {
        this.isDrawing = true;
        this.hasSignature = true;
        const coords = this.getCoordinates(event);
        this.currentStroke = [coords];
        
        this.ctx.beginPath();
        this.ctx.moveTo(coords.x, coords.y);
        
        // Hide placeholder
        document.getElementById('canvasPlaceholder').classList.add('hidden');
        this.canvas.parentElement.classList.add('drawing');
    }

    draw(event) {
        if (!this.isDrawing) return;

        const coords = this.getCoordinates(event);
        this.currentStroke.push(coords);
        
        this.ctx.lineTo(coords.x, coords.y);
        this.ctx.stroke();
    }

    stopDrawing() {
        if (this.isDrawing && this.currentStroke.length > 0) {
            this.strokes.push({
                points: [...this.currentStroke],
                color: this.currentColor
            });
        }
        this.isDrawing = false;
        this.currentStroke = [];
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.strokes = [];
        this.hasSignature = false;
        document.getElementById('canvasPlaceholder').classList.remove('hidden');
        this.canvas.parentElement.classList.remove('drawing');
    }

    undo() {
        if (this.strokes.length === 0) return;
        
        this.strokes.pop();
        this.redrawCanvas();
        
        if (this.strokes.length === 0) {
            this.hasSignature = false;
            document.getElementById('canvasPlaceholder').classList.remove('hidden');
            this.canvas.parentElement.classList.remove('drawing');
        }
    }

    redrawCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.strokes.forEach(stroke => {
            if (stroke.points.length === 0) return;
            
            this.ctx.strokeStyle = stroke.color;
            this.ctx.beginPath();
            this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            
            stroke.points.forEach(point => {
                this.ctx.lineTo(point.x, point.y);
            });
            
            this.ctx.stroke();
        });
        
        // Restore current color
        this.ctx.strokeStyle = this.currentColor;
    }

    setColor(color) {
        this.currentColor = color;
        this.ctx.strokeStyle = color;
    }

    handleResize() {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.setupCanvas();
        this.ctx.putImageData(imageData, 0, 0);
    }

    getSignatureData() {
        return this.canvas.toDataURL('image/png');
    }

    isEmpty() {
        return !this.hasSignature;
    }
}

// Form Handler
class SignatureForm {
    constructor() {
        this.form = document.getElementById('signatureForm');
        this.signatureCapture = new SignatureCapture('signatureCanvas');
        this.setupEventListeners();
        this.loadStoredSignatures();
    }

    setupEventListeners() {
        // Form submission
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));

        // Clear button
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.signatureCapture.clear();
        });

        // Undo button
        document.getElementById('undoBtn').addEventListener('click', () => {
            this.signatureCapture.undo();
        });

        // Color picker buttons
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.signatureCapture.setColor(e.target.dataset.color);
            });
        });

        // Set default active color
        document.querySelector('.color-btn').classList.add('active');
    }

    async handleSubmit(e) {
        e.preventDefault();

        // Validate signature
        if (this.signatureCapture.isEmpty()) {
            alert('Por favor, proporcione su firma antes de enviar el formulario.');
            return;
        }

        // Deshabilitar botón de envío
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Guardando...';

        // Get form data y normalizar (quitar acentos, mayúsculas)
        const rawName = document.getElementById('fullName').value.trim();
        const rawDoc = document.getElementById('document').value.trim();
        
        // Normalizar: remover acentos y convertir a mayúsculas
        const normalizedName = rawName
            .toUpperCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
            .replace(/\s+/g, ' ') // Normalizar espacios
            .trim();
        
        const normalizedDoc = rawDoc
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '') // Solo letras y números
            .trim();
        
        console.log('📝 Datos originales:', { nombre: rawName, curp: rawDoc });
        console.log('✅ Datos normalizados:', { nombre: normalizedName, curp: normalizedDoc });
        
        const formData = {
            fullName: normalizedName,
            document: normalizedDoc,
            signature: this.signatureCapture.getSignatureData(),
            timestamp: new Date().toISOString(),
            id: Date.now().toString()
        };

        try {
            // Guardar firma
            await this.saveSignature(formData);

            // Mostrar éxito
            this.showSuccess({
                'Nombre Completo': formData.fullName,
                'CURP/RFC': formData.document,
                'Estado': 'Firma registrada exitosamente'
            });

        } catch (error) {
            console.error('Error:', error);
            alert('❌ Error al guardar la firma. Por favor, intente nuevamente.');
            submitBtn.disabled = false;
            submitBtn.textContent = '✓ Guardar Firma';
        }
    }

    async saveSignature(data) {
        try {
            // Forzar mayúsculas en nombre y documento antes de guardar
            const dataToSave = {
                fullName: data.fullName.toUpperCase(),
                document: data.document.toUpperCase(),
                signature: data.signature,
                timestamp: data.timestamp,
                id: data.id
            };
            
            if (CONFIG.USE_FIREBASE && db) {
                // Buscar y eliminar registros anteriores con el mismo CURP/RFC
                console.log('🔍 Buscando registros anteriores con CURP/RFC:', dataToSave.document);
                
                const existingDocs = await db.collection('signatures')
                    .where('document', '==', dataToSave.document)
                    .get();
                
                if (!existingDocs.empty) {
                    console.log(`📋 Se encontraron ${existingDocs.size} registro(s) anterior(es)`);
                    
                    // Eliminar todos los registros anteriores
                    const deletePromises = [];
                    existingDocs.forEach(doc => {
                        console.log(`🗑️ Eliminando registro anterior: ${doc.id} (${doc.data().timestamp})`);
                        deletePromises.push(db.collection('signatures').doc(doc.id).delete());
                    });
                    
                    await Promise.all(deletePromises);
                    console.log('✅ Registros anteriores eliminados');
                }
                
                // Guardar el nuevo registro
                await db.collection('signatures').doc(dataToSave.id).set(dataToSave);
                console.log('✅ Nueva firma guardada en Firebase:', dataToSave.id);
                
            } else {
                // localStorage para desarrollo - también eliminar duplicados
                let signatures = JSON.parse(localStorage.getItem('signatures') || '[]');
                
                // Filtrar registros con el mismo CURP/RFC
                const previousCount = signatures.length;
                signatures = signatures.filter(sig => sig.document !== dataToSave.document);
                
                if (signatures.length < previousCount) {
                    console.log(`🗑️ Eliminados ${previousCount - signatures.length} registro(s) anterior(es) de localStorage`);
                }
                
                // Agregar el nuevo registro
                signatures.push(dataToSave);
                localStorage.setItem('signatures', JSON.stringify(signatures));
                console.log('✅ Nueva firma guardada en localStorage:', dataToSave.id);
            }
        } catch (error) {
            console.error('Error al guardar la firma:', error);
            throw error;
        }
    }

    loadStoredSignatures() {
        try {
            const signatures = JSON.parse(localStorage.getItem('signatures') || '[]');
            console.log(`Se encontraron ${signatures.length} firmas guardadas.`);
        } catch (error) {
            console.error('Error al cargar firmas:', error);
        }
    }

    showSuccess(personData = null) {
        // Hide form
        this.form.style.display = 'none';
        
        // Show success message
        const successMessage = document.getElementById('successMessage');
        
        // Actualizar mensaje con información adicional si hay datos de la persona
        if (personData) {
            const dataInfo = Object.entries(personData)
                .filter(([key, value]) => value && value !== 'nan')
                .map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`)
                .join('');
            
            successMessage.innerHTML = `
                <h3>✓ ¡Documento generado exitosamente!</h3>
                <p>Sus datos han sido verificados y el documento se ha descargado automáticamente.</p>
                <div style="text-align: left; margin-top: 20px; max-height: 300px; overflow-y: auto;">
                    <h4>Datos registrados:</h4>
                    <ul style="line-height: 1.8;">${dataInfo}</ul>
                </div>
            `;
        }
        
        successMessage.style.display = 'block';
        
        // Habilitar botón nuevamente
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = false;
        submitBtn.textContent = '✓ Guardar Firma';
        
        // Reset form after delay
        setTimeout(() => {
            this.form.reset();
            this.signatureCapture.clear();
            this.form.style.display = 'block';
            successMessage.style.display = 'none';
            
            // Restaurar mensaje original
            successMessage.innerHTML = `
                <h3>✓ ¡Firma guardada exitosamente!</h3>
                <p>Sus datos y firma han sido registrados correctamente.</p>
            `;
            
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 5000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new SignatureForm();
    
    // Forzar mayúsculas en campos de nombre y CURP
    const fullNameInput = document.getElementById('fullName');
    const documentInput = document.getElementById('document');
    
    if (fullNameInput) {
        fullNameInput.addEventListener('input', function(e) {
            const start = this.selectionStart;
            const end = this.selectionEnd;
            // Convertir a mayúsculas y permitir letras, espacios y acentos (se quitarán al guardar)
            this.value = this.value.toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ\s]/g, '');
            this.setSelectionRange(start, end);
        });
        
        // Validación al perder el foco
        fullNameInput.addEventListener('blur', function() {
            const value = this.value.trim();
            if (value.length > 0 && value.length < 10) {
                this.setCustomValidity('El nombre debe tener al menos 10 caracteres');
                this.reportValidity();
            } else {
                this.setCustomValidity('');
            }
        });
    }
    
    if (documentInput) {
        documentInput.addEventListener('input', function(e) {
            const start = this.selectionStart;
            const end = this.selectionEnd;
            // Convertir a mayúsculas y permitir solo letras y números
            this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            // Limitar a 18 caracteres
            if (this.value.length > 18) {
                this.value = this.value.substring(0, 18);
            }
            this.setSelectionRange(start, end);
        });
        
        // Validación al perder el foco
        documentInput.addEventListener('blur', function() {
            const value = this.value.trim();
            if (value.length > 0 && value.length !== 18) {
                this.setCustomValidity('La CURP debe tener exactamente 18 caracteres');
                this.reportValidity();
            } else {
                this.setCustomValidity('');
            }
        });
    }
});
