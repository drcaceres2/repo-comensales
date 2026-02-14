# ESPECIFICACIÓN TÉCNICA UI/UX: GESTIÓN DE COMIDAS ("ELEGIR COMIDAS")

**Versión:** 1.0 (Consolidado)
**Rol:** Frontend & Logic Architecture
**Objetivo:** Permitir a residentes y directores visualizar y modificar la elección de comidas, resolviendo conflictos entre rutinas base, excepciones manuales, ausencias y actividades.

## I. Modelo Mental y Arquitectura de Datos

1. *El Paradigma "Fuente vs. Proyección"*
  * Para evitar inconsistencias, la UI no muestra datos crudos. Muestra un Estado Resuelto.
  * Inputs (Persistidos en Firestore):
    + Semanario (Preferencia base cíclica).
    + Ausencias (Rangos de fechas "fuera de casa").
    + Excepciones (Cambios puntuales manuales).
    + Actividades (Eventos con reglas de inscripción).
    + ConfiguracionResidencia (Reglas de bloqueo).
  * Procesador (Cliente): Función Pura resolveMealState.
  * Output (Memoria RAM): VistaGrillaSemanal (La proyección que ve el usuario).
2. *La Cascada de Resolución de Conflictos.* La UI debe reflejar estrictamente este orden de prioridad (de mayor a menor):
  1. BLOQUEO: Si la hora/fecha está cerrada por administración -> Inmutable.
  2. ACTIVIDAD: Si el usuario está inscrito -> Sobrescribe todo.
  3. AUSENCIA: Si hay ausencia marcada -> Anula comida.
  4. EXCEPCIÓN: Si hay elección manual -> Sobrescribe semanario.
  5. SEMANARIO: Valor por defecto.

## II. Estrategia de Carga y Sincronización

  * Tecnología: Firestore Real-time Listeners (onSnapshot). No usar TanStack Query para esto.
  * Patrón de Ventana Deslizante: Solo suscribirse a los datos del rango de fechas visible (ej. Mes Actual ± 7 días).
  * Manejo Offline:
    + Lectura: Permitida (Persistencia de Firestore).
    + Escritura: Bloqueada en UI. Mostrar banner: "Modo Sin Conexión - Solo Lectura".
  * Reactividad: Si el Director cancela una comida o cambia una regla, la UI del residente se actualiza instantáneamente (sin refrescar).

## III. Arquitectura de Componentes (React / Next.js)

Estructura de directorios recomendada: src/features/gestion-comidas/

1. *Contenedor Inteligente (Smart Component):* PaginaGestionComidas.tsx
  * Responsabilidad:
    + Gestionar Auth y obtener usuarioId.
    + Instanciar hook useCalculadoraGrilla.
    + Manejar estado de carga (Skeletons).
    + Pasar datos procesados (VistaGrillaSemanal) a los componentes visuales.
  * *Header:*
    + Selector de Fechas (Semanal).
    + Botón Crítico: "⚙️ Configurar Rutina Base" (Lleva a una vista separada, sin fechas, para editar el Semanario).
2. *Componentes de Presentación (Dumb Components)* 
  * **GrillaUnificada.tsx** 
    + Responsabilidad: Renderizado condicional según breakpoint.
    + Desktop (>768px): Renderiza <TablaEscritorio />.
    + Mobile (<=768px): Renderiza <ListaMovil />.
  * **CeldaComida.tsx (El Átomo Visual)** 
    + Props: EstadoCeldaComida (Interfaz definida en types.ts).
    + Estados Visuales:
      - Azul: Origen SEMANARIO.
      - Amarillo: Origen EXCEPCION.
      - Gris Rayado: Origen AUSENCIA.
      - Morado: Origen ACTIVIDAD.
      - Candado: Si estado === 'BLOQUEADO'.
    + Interacción: Clic abre ModalResolucion (si no está bloqueado).
3. *Modales de Acción*
  * **ModalResolucion.tsx (El Hub de Decisión)**
    + Contexto: Se abre al clicar una celda específica.
    + Contenido:
      - Tab 1: Plato: Lista de AlternativaTiempoComida. Selección guarda una Excepcion.
      - Tab 2: Ausencia: Switch "No vendré a esta comida". Guarda una Ausencia puntual (con advertencia de pérdida de reserva).
      - Tab 3: Nota: Input texto.
      - Info Actividad: Si la celda es ACTIVIDAD, muestra detalles y link para gestionar inscripción.
  * **ModalAusenciaMasiva.tsx**
    + Accionado por FAB (Botón flotante).
    + Permite crear Ausencia de rango largo (ej. Fin de semana, Vacaciones).

## IV. Lógica de Bloqueo (El "Snapshot")

El sistema debe impedir la edición basada en la ConfiguracionResidencia:
1. *Entropía:* HoraComida < HoraActual -> Bloqueado.
2. *Muro Móvil:* HoraComida <= ultimoTiempoEstandarBloqueado -> Bloqueado (Ya solicitado a cocina).
3. *Islas:* ActividadId IN actividadesEnProceso -> Bloqueado.

Feedback al Usuario: Si intenta editar una celda bloqueada, mostrar Toast: "El pedido para este horario ya fue enviado a cocina o el evento ha cerrado inscripciones."

## V. Referencia de Interfaces Clave (Resumen)

Para implementación, referirse a types.ts actualizado.

* VistaGrillaSemanal: Objeto mapeado por Fecha -> TiempoComidaId -> EstadoCelda.
* EstadoCeldaComida:
```TypeScript
{
  fecha: string;
  tiempoComidaId: string;
  origen: 'SEMANARIO' | 'EXCEPCION' | 'AUSENCIA' | 'ACTIVIDAD';
  estado: 'ABIERTO' | 'BLOQUEADO' | 'SOLO_LECTURA';
  contenido: { nombrePlato, alternativaId, ... };
}
```

## VI. Guía de Estilo y UX

* *Claridad ante todo:* No mezclar la vista de "Configuración de Semanario" con la vista de "Elegir Comidas de esta semana". Son pantallas distintas.
* *Feedback Inmediato:* Usar Optimistic UI o transiciones rápidas. Al seleccionar un plato, el modal se cierra y la celda cambia a amarillo al instante.
* Prevención de Errores:
  + Advertir al usuario si intenta poner una Excepción sobre una Actividad ("Perderás tu lugar en la actividad").
  + Advertir si pone Ausencia sobre una comida especial.