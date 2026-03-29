# Layout Visual - Solicitud Consolidada

## Fase 3: Tablero Principal (Vista Renderizada)

```
╔════════════════════════════════════════════════════════════╗
║                    🎯 CONSOLIDACIÓN                       ║
║              Total: 247 comensales        🔽             ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  📌 RECORDATORIOS              🎂 CUMPLEAÑOS              ║
║  ─────────────────            ─────────────               ║
║  • Verificar cocina           • Juan D.                   ║
║  • Confirmar entregas         • María G.                  ║
║                               • Pedro L.                  ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  CONTENIDO DINÁMICO (según tabActiva)                     ║
║                                                            ║
║  📍 Si tabActiva === "comensales":                        ║
║     ┌─ DESAYUNO (45 pax)                                 ║
║     │  └─ Regular (35 pax)                               ║
║     │     └─ Vegetariana: 5   Celíaca: 3  ...           ║
║     ├─ ALMUERZO (150 pax)                                ║
║     │  ├─ Menú Principal (120 pax)                       ║
║     │  │  └─ Pescado: 40   Pollo: 55  ...               ║
║     │  └─ Ligero (30 pax)                                ║
║     │     └─ Ensalada: 20  Pasta: 10  ...               ║
║     └─ CENA (52 pax)                                     ║
║        └─ ...                                            ║
║                                                            ║
║  📍 Si tabActiva === "novedades":                         ║
║     ┌─ DIETAS SOLICITADAS (3)                            ║
║     │  • Dieta Vegetariana x5 residentes                ║
║     │  • Dieta Sin Gluten x2 residentes                 ║
║     │  • Dieta Sin Lactosa x1 residente                 ║
║     ├─ NOVEDADES OPERATIVAS (2)                          ║
║     │  • Falla en estufa principal mañana               ║
║     │  • Proveedor de lácteos con retraso               ║
║     └─ ALTERACIONES (1)                                 ║
║        • Almuerzo del 29: Menú especial por evento      ║
║                                                            ║
║  📍 Si tabActiva === "otros":                            ║
║     ┌─ ACTIVIDADES (5)                                  ║
║     │  🟡 RADAR (Con Antelación):                       ║
║     │     • Gym el martes a las 10:00                  ║
║     │  🔴 CIERRE (Consolidación Obligatoria):          ║
║     │     • Bingo el viernes a las 18:00               ║
║     │  ⚫ CANCELACIÓN:                                  ║
║     │     • Clases de arte (instructor ausente)        ║
║     ├─ ATENCIONES (1)                                  ║
║     │  • Revisión médica para Javier - lunes          ║
║     ├─ EXCEPCIONES (0)                                 ║
║     │  (Sin excepciones pendientes)                    ║
║     └─ SOLICITUDES INVITADOS (0)                       ║
║        (Sin invitaciones nuevas)                       ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║         🍽️ Comensales  |  🔔 Novedades  |  ⚙️ Otros        ║
║                                                            ║
║  (Bottom Navigation Fixed)                               ║
╚════════════════════════════════════════════════════════════╝
```

---

## Estados Visuales

### 1. **Estado de Carga**
```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║              ⚡ GENERANDO CONSOLIDACIÓN                    ║
║                                                            ║
║              El tablero se cargará en momentos...          ║
║                                                            ║
║     ▰▰▰▰▰▰▰░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░           ║
║                                                            ║
║                    42%                                     ║
║                                                            ║
║            ⟳ Aplicando cascada...                         ║
║                                                            ║
║    💡 Mientras esperas, verifica que todos los            ║
║       pendientes fueron resueltos en la bandeja.          ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

### 2. **Estado de Error**
```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║                   ⚠️ ERROR DE CARGA                        ║
║                                                            ║
║         No se pudieron cargar los datos de la             ║
║         solicitud consolidada.                            ║
║                                                            ║
║         Errores:                                          ║
║         • Residencia no encontrada                        ║
║         • Verifica que tengas permisos de director        ║
║         • Recarga la página                               ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

### 3. **Estado Vacío**
```
╔════════════════════════════════════════════════════════════╗
║                    Preparando datos...                     ║
║                                                            ║
║                    (Loading placeholder)                  ║
╚════════════════════════════════════════════════════════════╝
```

---

## Componentes: Estructura de Props y Estado

### `StickyHeader.tsx`
```
┌─ STATE (Zustand)
│  ├─ encabezado.calendario.recordatorios[]
│  ├─ encabezado.calendario.cumpleanios[]
│  ├─ encabezado.colapsado: boolean
│  └─ pestana1.arbolComensales (para calcular total)
│
└─ RENDER
   ├─ Barra compacta
   │  ├─ Título + Total
   │  └─ Botón colapsable
   └─ Sección expandible
      ├─ Recordatorios (grid-left)
      └─ Cumpleaños (grid-right)
```

### `BottomNav.tsx`
```
┌─ STATE (Zustand)
│  └─ tabActiva: 'comensales' | 'novedades' | 'otros'
│
├─ ACTIONS
│  └─ Click en tab → store.setTabActiva(tab)
│
└─ RENDER
   ├─ Tab Comensales (Users icon)
   ├─ Tab Novedades (Bell icon)
   └─ Tab Otros (Settings icon)
      └─ Cada uno con styling condicional
```

### `EngineProgress.tsx`
```
┌─ STATE (Component)
│  ├─ progress: 0-95%
│  └─ messageIndex: 0-5
│
├─ EFFECTS
│  ├─ Increment progress cada 400ms
│  └─ Update message based on progress
│
└─ RENDER
   ├─ Icono animado
   ├─ Barra de progreso
   ├─ Porcentaje
   ├─ Mensaje dinámico
   └─ Tip de ayuda
```

### `consolidar/page.tsx`
```
┌─ PARAMS
│  └─ residenciaId: string
│
├─ HOOKS
│  ├─ useFase3SolicitudConsolidada(residenciaId)
│  │  └─ Auto-hidrata el store
│  └─ useSolicitudConsolidadaStore()
│     └─ Lee estado + acciones
│
├─ EFFECTS
│  ├─ Inicializa contexto en store
│  └─ Reset en cleanup (memory safety)
│
└─ RENDER
   ├─ Condicional: loading → EngineProgress
   ├─ Condicional: error → ErrorCard
   ├─ Condicional: empty → Placeholder
   └─ Layout:
      ├─ StickyHeader
      ├─ MainArea (según tabActiva)
      └─ BottomNav
```

---

## Flujo de Interacción

### Escenario 1: Usuario Abre el Módulo
```
1. consolidar/page.tsx monta
2. useParams() extrae residenciaId
3. useFase3SolicitudConsolidada(residenciaId) se ejecuta
4. TanStack Query:
   - Detecta caché (si exists)
   - Llama fase3SolicitudConsolidadaUI(residenciaId)
5. Server action devuelve datos
6. TanStack Query:
   - Inyecta en store automáticamente
   - store.setEncabezado(), setPestana1/2/3()
   - store.setCargandoFase3(false)
7. UI re-renderiza con datos
8. Usuario ve: Header + MainArea + BottomNav

Time: 0.5s - 2s (según red)
```

### Escenario 2: Usuario Cambia de Pestaña
```
1. Click en tab "Novedades"
2. BottomNav llama store.setTabActiva('novedades')
3. Zustand actualiza suscriptores
4. consolidar/page.tsx re-renderiza
5. MainArea condicional cambia a pestana2
6. Muestra: dietas + novedades + alteraciones

Time: <10ms (local state)
```

### Escenario 3: Usuario Expande Nodo en Árbol
```
1. Click en "ALMUERZO" en MainAccordion (futuro)
2. Componente llama store.toggleComensalExpandido('fecha__tiempoComida')
3. arbolComensalesExpandido.add('fecha__tiempoComida')
4. Zustand notifica
5. MainAccordion re-renderiza ese nodo
6. Muestra alternativas expandidas

Time: <5ms (local state)
```

### Escenario 4: Usuario Desmonta la Página
```
1. useEffect cleanup se ejecuta
2. store.reset() limpia TODO:
   - Encabezado, pestanas, estados de carga
   - arbolComensalesExpandido
   - tabActiva vuelve a 'comensales'
3. TanStack Query mantiene caché (para regresar rápido)
4. Componentes se desmontans
5. Memory: LIBERADA

Time: Inmediato
```

---

## Patrones de Renderización

### Renderización Condicional
```typescript
// consolidar/page.tsx
if (loadingFase3) return <EngineProgress />;
if (store.errorCarga) return <ErrorCard message={...} />;
if (!fase3Data) return <Placeholder />;

// Store sincronizado → render completo
return (
  <div>
    <StickyHeader />
    <main>
      {store.tabActiva === 'comensales' && <ComensalesContent />}
      {store.tabActiva === 'novedades' && <NovedadesContent />}
      {store.tabActiva === 'otros' && <OtrosContent />}
    </main>
    <BottomNav />
  </div>
);
```

### Renderización por Pestaña
```typescript
// Cada pestaña es conditional render
// NO se renderiza si no es activa
// Evita cálculos innecesarios

{store.tabActiva === 'comensales' && (
  <MainAccordion
    arbol={store.pestana1.arbolComensales}
    usuarios={store.pestana1.usuariosDiccionario}
    expandido={store.arbolComensalesExpandido}
    onToggle={store.toggleComensalExpandido}
  />
)}
```

### Renderización Sticky
```typescript
// StickyHeader siempre visible
// Calcula total en tiempo real
const totalComensales = Object.values(
  store.pestana1.arbolComensales
).reduce((sum, tiempos) => {
  // Aggregation lógica
  return sum + tiempoSum;
}, 0);
```

---

## Animaciones y Transiciones

### Header Collapse
```css
/* ChevronDown rotación */
transform: rotate(0deg);
transform: rotate(180deg); /* Cuando collapsed */
transition: transform 0.3s ease;
```

### Tab Selection
```css
/* Active tab */
bg: blue-50;
color: blue-600;
font-weight: semibold;

/* Inactive tab */
bg: gray-50;
color: gray-600;
transition: all 0.2s ease;

hover:
  bg: gray-100;
```

### Progress Bar
```css
/* width: 0% → 95% */
width: var(--progress);
transition: width 0.3s ease-out;
background: linear-gradient(to-right, #3b82f6, #4f46e5);
```

---

## Responsive Design

```
DESKTOP (>1024px)
├─ Header: width-full, px-8
├─ MainArea: grid-2-cols (future)
└─ BottomNav: width-full

TABLET (768-1024px)
├─ Header: width-full, px-4
├─ MainArea: grid-1-col, adaptive
└─ BottomNav: width-full

MOBILE (<768px)
├─ Header: width-full, px-3, compact
├─ MainArea: full-width, stack-vertical
└─ BottomNav: sticky, safe-area-inset-bottom
```

---

## Conclusión

El layout está **completamente modelado** y listo para:
1. ✅ Recibir datos del servidor
2. ✅ Renderizar con transiciones suaves
3. ✅ Mantener memoria limpia
4. ✅ Escalar a nuevos componentes

Próximo: Implementar contenido específico de cada pestaña (MainAccordion, NovedadesContent, OtrosContent).

