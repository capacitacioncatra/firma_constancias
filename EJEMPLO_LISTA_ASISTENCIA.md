# Formato de Lista de Asistencia

## 📚 Archivos con Múltiples Hojas (Por Día)

### ✨ Detección Automática de Hojas

El sistema puede **detectar automáticamente la hoja del día actual** si el nombre coincide con alguno de estos formatos:

#### Formatos soportados:
- **Fecha con mes**: "3 Diciembre", "03 Diciembre"
- **Mes abreviado**: "Dic 3", "Dic 03"
- **Formato numérico**: "03-12-2025", "3-12-2025", "03/12/2025"
- **Día de la semana**: "Martes", "Mar"

#### ¿Cómo funciona?
1. **Cargas el archivo Excel** completo (con todas las hojas de la semana/mes)
2. El sistema **busca automáticamente** la hoja del día actual
3. Si **encuentra coincidencia**, carga esa hoja directamente ✅
4. Si **no encuentra**, muestra un **selector** para que elijas manualmente 📋

### Ejemplo de estructura de archivo:

```
📁 Asistencia_Diciembre_2025.xlsx
  📄 Lunes 2 Diciembre
  📄 Martes 3 Diciembre     ← El sistema detectará esta hoja hoy
  📄 Miércoles 4 Diciembre
  📄 Jueves 5 Diciembre
```

---

## Cómo preparar el archivo Excel

El sistema leerá automáticamente la **primera columna** de la hoja seleccionada.

### Formato requerido:

```
| Nombre Completo           |
|---------------------------|
| JUAN PÉREZ GARCÍA         |
| MARÍA LÓPEZ HERNÁNDEZ     |
| CARLOS RODRÍGUEZ MARTÍNEZ |
| ANA GONZÁLEZ SÁNCHEZ      |
```

### Instrucciones para crear hojas por día:

1. **Abrir Excel** y crear un nuevo archivo
2. **Crear una hoja por día** con nombres descriptivos:
   - Ejemplo: "Lunes 2", "Mar 3 Dic", "03-12-2025", etc.
3. **En cada hoja, columna A**, escribir los nombres completos (uno por fila)
4. Puedes tener un encabezado en la primera fila (ej: "Nombre Completo")
5. Los nombres pueden estar en mayúsculas o minúsculas (el sistema los normalizará)
6. **Guardar como** `.xlsx` o `.xls`

### Ventajas de usar múltiples hojas:
- ✅ **Un solo archivo** para toda la semana o mes
- ✅ **Detección automática** del día actual
- ✅ **Menos archivos** que gestionar
- ✅ **Selector manual** si los nombres de hojas no coinciden

### Notas importantes:

- ✅ El sistema solo lee la **primera columna**
- ✅ Ignora encabezados comunes ("Nombre", "Nombres", etc.)
- ✅ Normaliza acentos y mayúsculas para la comparación
- ✅ La lista se guarda automáticamente para el día actual
- ✅ Si cargas una nueva lista, reemplazará la anterior

### Ejemplo visual de Excel:

```
A                           B               C
Nombre Completo            CURP            Grupo
JUAN PÉREZ GARCÍA          PEGJ900101...   A1
MARÍA LÓPEZ HERNÁNDEZ      LOHM850505...   A1
CARLOS RODRÍGUEZ MARTÍNEZ  ROMC920303...   A2
```

**El sistema solo leerá la columna A** (Nombre Completo)

### 📅 Selector de Fecha

### Nueva funcionalidad: Elegir el día manualmente

Ahora puedes **seleccionar cualquier fecha** desde la interfaz antes de cargar el Excel:

1. **Selector de fecha** arriba del botón "Cargar Lista Excel"
2. Por defecto muestra **hoy**
3. Puedes cambiarla para ver asistencia de días anteriores o futuros
4. El sistema buscará firmas de esa fecha específica

### Casos de uso:

- **Ver asistencia de ayer**: Cambia la fecha al día anterior
- **Preparar lista para mañana**: Selecciona fecha futura
- **Revisar semana pasada**: Navega por fechas anteriores
- **Flexibilidad total**: No estás limitado solo a "hoy"

---

## Después de cargar el Excel:

1. El sistema muestra la **fecha seleccionada** y la **hoja cargada**
2. El botón "Ver Tabla de Cotejo" se activará
3. Podrás ver quién ha firmado (✅) y quién falta (❌) **en esa fecha**
4. Puedes exportar un Excel con solo los faltantes
5. Los filtros te permiten ver todos o solo faltantes
6. **Cambiar la fecha** recalcula automáticamente las estadísticas

---

## Ejemplo de uso:

1. **Preparar Excel** con los nombres esperados
2. **Cargar Excel** en el panel de administración
3. **Ver estadísticas** actualizadas (Firmaron / Faltan)
4. **Abrir tabla de cotejo** para ver detalle
5. **Exportar faltantes** si necesitas enviar recordatorios
