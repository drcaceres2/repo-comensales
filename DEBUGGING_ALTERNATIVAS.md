# Guía de Debugging - Alternativas en Solicitud Consolidada

## 🎯 Flujo de Resolución de Alternativas

```
Backend (server-actions.ts)
    ↓
    Fase 3: fase3SolicitudConsolidadaUI()
    ├─ Para cada usuario + fecha + tiempoComida:
    │   ├─ resolverCascadaTiempoComida() → retorna configuracionAlternativaId
    │   ├─ Busca si ese ID está asociado al horarioSolicitudSeleccionado
    │   ├─ Si pasa el filtro, agrega usuario al árbol
    │   └─ Rellena usuariosDiccionario[userId].alternativasPorFecha[fecha][tiempoComida]
    ├─ Construye tiempoComidaNombres Map (esquemaSemanal → nombre)
    ├─ Construye alternativaNombres Map (configuracionesAlternativas → nombre)
    └─ Retorna selectedHorarioSolicitudId + mapas
    ↓
Frontend (queries.ts)
    ├─ Hidrata store con todo lo anterior
    ↓
UI (MainAccordion.tsx)
    ├─ Lee arbolComensales[fecha][tiempoComida][dieta] = [usuarios]
    ├─ Para cada usuario:
    │   ├─ resolveAlternativaId(usuario, fecha, tiempoComida)
    │   │   ├─ Busca usuario.alternativasPorFecha[fecha][tiempoComida]
    │   │   └─ Sino, busca usuario.alternativasPorTiempoComida[tiempoComida]
    │   └─ Si no encuentra, retorna 'alternativa_no_determinada'
    ├─ Agrupa por alternativaId
    └─ Renderiza tarjetas con alternativaNombres[altId] ?? altId
```

## 🔴 Causas Comunes de Tarjetas Vacías

### 1. `alternativaNombres` Vacío
**Síntoma**: Console log muestra `[MainAccordion] alternativaNombres: {}`

**Causas**:
- Backend no tiene `configuracionesAlternativas` en el singleton
- `catalogoAlternativas` no existe o está vacío
- Error en la construcción del mapa en server-actions.ts línea ~1305

**Solución**:
```javascript
// En consola de DevTools:
// Verifica en la petición XHR a /api/... → Response → pestana1.alternativaNombres
```

---

### 2. `AltId` = `'alternativa_no_determinada'`
**Síntoma**: Console log muestra `AltId: alternativa_no_determinada`

**Causas**:
- `usuario.alternativasPorFecha` no está relleno en el backend
- `usuario.alternativasPorTiempoComida` tampoco está relleno
- Línea ~1499 en server-actions.ts no se ejecutó

**Solución**:
```javascript
// En consola, verifica:
console.log(store.pestana1.usuariosDiccionario[USERID_AQUI].alternativasPorFecha)
// Debería ser algo como: { "2026-04-01": { "jueves_almuerzo": "almuerzo_normal_jueves" } }
```

---

### 3. `AltId` existe pero `alternativaNombres[altId]` es undefined
**Síntoma**: Console log muestra `AltId: almuerzo_normal_jueves` pero tarjeta dice "almuerzo_normal_jueves" (fallback al ID)

**Causas**:
- El mapa no incluye esa key
- El nombre no se extrajo correctamente de la definición

**Solución**:
```javascript
// En consola:
console.log(store.pestana1.alternativaNombres['almuerzo_normal_jueves'])
// Si undefined, significa que no llegó al mapa
```

---

### 4. Árbol de Comensales Vacío
**Síntoma**: "No hay comensales para mostrar"

**Causas**:
- Filtro por `horarioSolicitudSeleccionado` excluyó todo
- Ninguna alternativa tiene `horarioSolicitudComidaId` asignado
- Los usuarios no tienen `alternativasPorFecha` rellenado

**Solución**:
```javascript
// En consola:
console.log(store.pestana1.selectedHorarioSolicitudId)
console.log(store.pestana1.arbolComensales)
// Si arbolComensales está vacío y selectedHorarioSolicitudId existe,
// es un problema de filtrado en server-actions.ts línea ~1490
```

---

## 🔧 Cómo Depurar Paso a Paso

### Paso 1: Validar Mapas al Cargar
Abre DevTools → Console → Pega:
```javascript
const { useSolicitudConsolidadaStore } = await import('./src/app/[residenciaId]/gerencia/solicitud-consolidada/_lib/store.ts');
const store = useSolicitudConsolidadaStore.getState();
console.log('=== MAPAS DE NOMBRES ===');
console.log('Tiempos:', store.pestana1.tiempoComidaNombres);
console.log('Alternativas:', store.pestana1.alternativaNombres);
console.log('Horario Seleccionado:', store.pestana1.selectedHorarioSolicitudId);
```

### Paso 2: Validar Árbol de Comensales
```javascript
const store = useSolicitudConsolidadaStore.getState();
const fechas = Object.keys(store.pestana1.arbolComensales);
console.log('Fechas disponibles:', fechas);
if (fechas[0]) {
  const fecha = fechas[0];
  const tiempos = Object.keys(store.pestana1.arbolComensales[fecha]);
  console.log(`Tiempos en ${fecha}:`, tiempos);
  if (tiempos[0]) {
    const tiempo = tiempos[0];
    const dietas = Object.keys(store.pestana1.arbolComensales[fecha][tiempo]);
    console.log(`Dietas en ${fecha}/${tiempo}:`, dietas);
  }
}
```

### Paso 3: Validar Alternativas de Usuario
```javascript
const store = useSolicitudConsolidadaStore.getState();
const usuarios = Object.keys(store.pestana1.usuariosDiccionario).slice(0, 3);
usuarios.forEach(uid => {
  const usuario = store.pestana1.usuariosDiccionario[uid];
  console.log(`Usuario ${usuario.nombre}:`, {
    alternativasPorFecha: usuario.alternativasPorFecha,
    alternativasPorTiempoComida: usuario.alternativasPorTiempoComida,
  });
});
```

---

## 📊 Tabla de Estado Esperado

| Campo | Tipo | Ejemplo | Si Vacío |
|-------|------|---------|----------|
| `selectedHorarioSolicitudId` | string \| null | `"horario_almuerzo"` | Todo filtrado |
| `tiempoComidaNombres` | Record<string, string> | `{ "jueves_almuerzo": "Almuerzo" }` | Muestra IDs sin nombres |
| `alternativaNombres` | Record<string, string> | `{ "almuerzo_normal_jueves": "Menú Normal" }` | Muestra IDs sin nombres |
| `arbolComensales` | Record<fecha, Record<tiempo, Record<dieta, usuarioId[]>>> | `{ "2026-04-01": { "jueves_almuerzo": { "sin_dieta": ["uid1"] } } }` | "No hay comensales" |
| `usuariosDiccionario[uid].alternativasPorFecha` | Record<fecha, Record<tiempo, configAltId>> | `{ "2026-04-01": { "jueves_almuerzo": "almuerzo_normal_jueves" } }` | Alternativa "no_determinada" |

---

## 💡 Quick Fixes

**Si ves "alternativa_no_determinada" en todas las tarjetas**:
1. Asegúrate que `usuariosDiccionario` se está llenando con `alternativasPorFecha` en server-actions.ts
2. Verifica que la línea ~1499 está dentro del `if (tarjeta.resultadoEfectivo.configuracionAlternativaId)` block

**Si ves tarjetas con IDs en lugar de nombres**:
1. Verifica que `tiempoComidaNombres` y `alternativaNombres` no estén vacíos
2. Revisa que los IDs de alternativa coincidan entre el árbol y el mapa

**Si no hay comensales pero el árbol no está vacío**:
1. Verifica que `selectedHorarioSolicitudId` sea el correcto
2. Busca si las alternativas en el árbol tienen `horarioSolicitudComidaId` asignado en la BD


