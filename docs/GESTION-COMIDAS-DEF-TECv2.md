# ESPECIFICACIÓN TÉCNICA UI/UX: GESTIÓN DE COMIDAS

**Versión:** 2.0 (Final)
**Alcance:** Frontend (Next.js), Lógica de Dominio y Reglas de Integridad.
**Objetivo:** Una página para que los residentes elijan sus horarios de comidas.

## 1. Arquitectura de Datos y Estado (Core Concepts)

### 1.1. *El Principio de "Estado Derivado" (RAM vs Disco)*

Para garantizar consistencia y evitar escrituras masivas innecesarias:
  + NO EXISTE una colección `SemanarioDesnormalizado` en la base de datos.
  + La vista final (la Grilla) es una Proyección en Memoria calculada al vuelo en el navegador del cliente.
  * Fórmula: `Vista = FunciónPura(Semanario + Ausencias + Excepciones + Actividades + Bloqueos)`.

### 1.2. *La Cascada de Prioridad (Regla de Oro)*

Cualquier conflicto visual se resuelve respetando estrictamente este orden:
  1. BLOQUEADO (Candado): Por configuración de residencia (pasado o snapshot generado)
  2. ACTIVIDAD (Morado): Inscripción a evento.
  3. AUSENCIA (Gris): Rango de fechas marcado como ausente.
  4. EXCEPCIÓN (Amarillo): Elección manual puntual.
  5. SEMANARIO (Azul): Valor por defecto del usuario.

## 2. Flujo de Datos e Interconexión (The Wiring)

Este diagrama describe cómo "cobran vida" los componentes.

### 2.1. El Pipeline de Datos (React Hooks)**

1. *Input (Suscripción):* El hook `useGestorComidas` mantiene 5 suscripciones activas (`onSnapshot`) filtradas por el rango de fechas visible (Ventana Deslizante).
  * `coleccion_semanarios`
  * `coleccion_ausencias` (where date in range)
  * `coleccion_excepciones` (where date in range)
  * `coleccion_actividades` (where date in range)
  * `configuracion_residencia` (Doc único)
2. *Procesamiento (La Función Pura):* Dentro del componente contenedor, un `useMemo` ejecuta `calcularEstadoComida` cada vez que cambia un input.
  * *Input:* Arrays crudos de Firestore.
  * *Output:* Objeto `VistaGrillaSemanal` (Mapeado por fecha).
3. *Consumo (UI):* El componente `GrillaComidasUnificada` recibe el objeto `VistaGrillaSemanal` ya digerido. **No realiza cálculos, solo renderiza.**
4. *Acción (Mutación):* Al guardar en el Modal:
  * Se llama a `crearExcepcion` (Firestore SDK).
  * Firestore actualiza la nube.
  * El `onSnapshot` (Paso 1) detecta el cambio.
  * El `useMemo` (Paso 2) recalcula la celda.
  * La UI se actualiza sola (Ciclo virtuoso).

## 3. Estructura de Componentes

Ubicación: `src/features/gestion-comidas/`

>Plaintext
>├── components/
>│   ├── containers/
>│   │   └── PaginaGestionComidas.tsx  <-- [SMART] Orquestador, Auth, Skeletons
>│   ├── layout/
>│   │   ├── CabeceraNavegacion.tsx    <-- Selector de Semanas
>│   │   └── LeyendaEstados.tsx        <-- Guía de colores
>│   ├── grilla/
>│   │   ├── GrillaUnificada.tsx       <-- [DUMB] Switcher Responsive
>│   │   ├── TablaEscritorio.tsx       <-- <table> HTML
>│   │   ├── ListaMovil.tsx            <-- Cards verticales
>│   │   └── CeldaComida.tsx           <-- [DUMB] Renderiza el EstadoCeldaComida
>│   └── modales/
>│       ├── ModalResolucion.tsx       <-- [SMART] Formulario de Edición
>│       └── ModalAusenciaMasiva.tsx   <-- Formulario de Rango
>├── hooks/
>│   ├── useSuscripcionDatosComida.ts        <-- Conexión a Firestore
>│   └── useCalculadoraGrilla.ts          <-- Implementa la Función Pura + useMemo
>└── logic/
>    └── motorResolucion.ts               <-- Lógica pura TypeScript (Testeable)

## 4. Descripción de la Interfaz (UI Specs)

### 4.1 La Celda (`CeldaComida`)

Debe comunicar estado sin necesidad de interacción (Glanceability).

* Estado Bloqueado: Opacidad 60%, Icono Candado. Cursor `not-allowed`.
* Estado Actividad: Fondo Morado. Texto: Título Actividad.
* Estado Ausencia: Fondo Rayado Gris. Texto: "Ausente".
* Estado Conflicto: Icono alerta si hay "Dieta Especial" pero la actividad es "Menú Único".

### 4.2 El Modal de Resolución (`ModalResolucion`)

No es un simple alert. Es el centro de control del día.

* **Validación Reactiva (Zod en Cliente):**
  + Si selecciona "Ausencia", deshabilitar selector de platos.
  + Advertencia visual: *"Al marcar ausencia, perderás tu selección de plato actual."*
* **Feedback de Bloqueo:** Si el usuario abre una celda pasada (hackeando el HTML), el modal muestra: *"Error: Periodo cerrado."* y deshabilita el botón guardar.
* **Filtrado de Opciones:** La lista de platos (AlternativaTiempoComida) no es estática. Debe computarse al abrir el modal:
```TypeScript
opcionesDisponibles = todasLasOpciones.filter(opcion => 
   Ahora + opcion.tiempoAntelacion <= HoraServicio
);
```

## 5. Reglas de Integridad y Validación

Aunque `firestore.rules` protege el backend, la UI debe anticipar estas reglas para una buena UX.

### 5.1 Reglas de Escritura (Zod Schema Suggestion)

El formulario de `Excepcion` debe cumplir:

```TypeScript
const ExcepcionSchema = z.object({
  fecha: z.string().refine(val => val >= HOY, "No puedes editar el pasado"),
  tiempoComidaId: z.string(),
  alternativaId: z.string().optional(), // Requerido si no es ausencia
  // Validar contra configuración de residencia
});
```

### 5.2 Reglas de Bloqueo (Entropía y Snapshot)

La UI debe considerar una celda como READ_ONLY si:
1. HoraComida < HoraActual (Pasado).
2. HoraComida <= configuracion.ultimoTiempoEstandarBloqueado (Snapshot generado).
3. ActividadId está en configuracion.actividadesEnProceso.

### 5.3 Disponibilidad Dinámica (La Paradoja de la Lonchera)

La validación de tiempo no es uniforme para todo el Tiempo de Comida. Cada `Alternativa` puede tener su propio **"Lead Time" (Tiempo de Antelación)**.

* **El Caso del Almuerzo para Llevar:** Aunque el almuerzo se sirve a las 13:00, la alternativa "Bolsa/Lonchera" puede requerir solicitarse antes de las 21:00 del día anterior (antes incluso del desayuno de hoy).
* **Comportamiento del Modal:**
  + Al abrir el modal de un tiempo de comida "ABIERTO", el sistema debe filtrar o deshabilitar las alternativas individuales cuyo deadline específico ya pasó.
  + Ejemplo: A las 09:00 AM, para el Almuerzo de hoy:
    - "Menú Normal" -> Disponible.
    - "Bolsa para Llevar" -> Deshabilitado (Requiere antelación 12h).
* **Comportamiento del Bloqueo de Celda (Pre-selección):**
  + Si la elección actual del usuario (vía Semanario) es una alternativa con deadline vencido (ej. "Bolsa"), y el usuario intenta cambiarla, el sistema permite el cambio hacia una opción estándar ("Menú Normal"), pero advierte que no podrá volver a elegir "Bolsa".

## 6. Próximos Pasos para Desarrollo

1. Backend/Types: Copiar types.ts refactorizado.
2. Logic: Implementar motorResolucion.ts (Función Pura) y sus tests unitarios.
3. Skeleton: Crear la estructura de carpetas y componentes vacíos.
4. Wiring: Conectar el hook de suscripción y verificar que la data fluye a la consola.
5. UI: Maquetar la grilla y los modales.