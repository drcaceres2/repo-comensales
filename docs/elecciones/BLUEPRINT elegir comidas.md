# BLUEPRINT ARQUITECTÓNICO: Módulo de Elección de Horarios v4.0 (Definitivo)

Este módulo se encarga de recoger las elecciones de horario por parte de los residentes e invitados. Los directores pueden cambiar las elecciones de cualquier residente. Los asistentes funcionan como directores según sus permisos específicos. Las elecciones de horario (capa de intención) se expresan a través de inscripción a actividades, programación de ausencias, excepciones y su semanario.

## 1. Directrices Base y Matriz de Prioridades
Este módulo es el núcleo táctico del usuario. La evaluación de compromisos (*Trade-offs*) se rige estrictamente por este orden:
1. **Integridad Transaccional (Prioridad 0):** La inmutabilidad de los tiempos de comida la dicta el servidor (Snapshot/Time-Drift Neutral). El frontend recibe siempre un payload "denso" de 7 días, calculado por el servidor a partir de una base de datos "dispersa" (evitando sobrecarga de lecturas/escrituras en Firestore).
2. **Mobile-First Estricto (Prioridad 1):** Carga cognitiva minimizada. Sin grillas. Uso intensivo de *Superficie* (resumen) y *Profundidad* (detalle en drawer).
3. **Optimistic UI (Prioridad 2):** Latencia percibida cero para mutaciones locales, gestionando *rollbacks* silenciosos si el servidor rechaza (ej. choque de concurrencia).
4. **Offline-First Parcial (Prioridad 3):** Caché de lectura obligatoria (IndexedDB vía TanStack Query) para el semanario en curso.

## 2. Topología de Datos (Firestore) y Orígenes de Verdad
* **Vista Materializada Dispersa (Sparse):** `residencias/{resId}/horariosEfectivos/{fecha}`. *Solo existen documentos si la Capa 0 alteró ese día, o lo que es lo mismo, hay una "alteracion". Si no existe, el servidor calcula el fallback con el Singleton.*
* **Intención del Usuario (Mutables):**
    * `usuarios/{uid}/excepciones/{fecha-slug}` (Requiere índice compuesto `residenciaId` + `fecha` para soportar CollectionGroups).
    * `usuarios/{uid}/ausencias/{fechaInicio}`
    * `usuarios/{uid}` (Contiene el diccionario `semanarios: Record<string, SemanarioUsuario>` donde la clave es la semana ISO ej. `2024-W42`).
* **Contexto Operativo (Informativos):**
    * `residencias/{resId}/novedadesOperativas/{auto-id}` (Alimenta el banner).
    * `usuarios/{uid}/mensajes/{auto-id}` (Bandeja de entrada).

## 3. Concurrencia y Control de Autoridad
* **Campo `origenAutoridad`:** Presente en toda Excepción/Ausencia (`residente`, `director-modificable`, `director-restringido`).
* **Regla de Servidor (Fail-Close):** El *Server Action* abortará cualquier mutación del residente si el registro previo ostenta la marca `director-restringido`.

## 4. Arquitectura de Interfaz (UI/UX)

Al abrir el módulo, la vista principal da un panorama general de las elecciones de horarios de comida del día (hoy). En la parte de arriba, en caso que aplique, hay un selector de usuario (impersonator). Luego un selector de día en forma de banda de calendario (calendar strip) deslizable horizontalmente. Luego un carrusel de tarjetas (card carousel) donde se mira principalmente la tarjeta actual, y los bordes de las tarjetas anterior y siguiente. El carrusel se conecta con la banda de calendario. Dentro de la tarjeta de día hay tarjetas por tiempo de comida. Todo esto constituye la "superficie".

Hay un "drawer" que aparece desde abajo dando la "profundidad", muestra el detalle de cada carta (tiempo de comida).

Hay un FAB con tres acciones (botones circulares que surgen de él): Nueva excepción, nueva ausencia y nueva novedad operativa. Cada uno de ellos activa un modal.

### 4.1 Jerarquía y Superficie (Vista Principal)
* **Banda Superior Global:** Menú Hamburguesa, Inbox (contador de mensajes), Icono Time-Drift (falla de reloj local).
* **Barra de Suplantación (Impersonator):** Ubicada justo debajo de la banda superior. Exclusiva para `director`/`asistente`. Neutra por defecto; amarilla al suplantar.
* **Calendario (Calendar Strip):** Días del $N-1$ al $N+7$. Debajo del número del día: punto (1 día) o línea continua (múltiples días) para actividades.
* **Tarjetas Diarias:** Resultado efectivo (Fail-close) y un único *Slot de Estado* (Ícono de advertencia para alteraciones de Capa 0 o restricciones, candado para cierres).
* **Sticky Banner:** Totalizador de novedades operativas vigentes.
* **Floating Action Button (FAB):** Patrón *Radial/Speed Dial*. Al tocar el "+", emergen tres opciones para lanzar Modales: Nueva Excepción, Nueva Ausencia, Nueva Novedad.

### 4.2 Anatomía de Modales (Accionados desde el FAB)
* **Modal de Ausencia:** Selector de rango de fechas. El *submit* dispara la acción que genera múltiples `excepciones` en lote.
* **Modal de Excepción Libre:** Selector de Fecha, Tiempo de Comida y Alternativa.
* **Modal de Novedad Operativa:** Reutiliza el componente `NovedadFormModal`. Al hacer submit, invalida la caché para actualizar el Sticky Banner.

### 4.3 La Profundidad (Anatomía del Bottom Drawer)
Emergente desde abajo al tocar una Tarjeta Diaria. Siempre incluye un ícono "X" para cerrar.
* **Estado 1: Inmutable por Sistema (Capa 0 o Pasado)**
    * **Header:** Título del grupo de comida con fondo gris (`bg-gray-100 dark:bg-zinc-800`).
    * **Cuerpo:** Mensaje formativo destacado (Ej. *"Servicio suspendido por Dirección: Fuga de gas"*).
    * **Acciones:** Ninguna.
* **Estado 2: Inmutable por Restricción de Grupo**
    * **Cuerpo:** Mensaje formativo detallado (Ej. *"Como residente de 1er año, no puedes elegir Cenar Fuera entre semana."*).
    * **Acciones:** Selector de alternativas restringido a las opciones válidas para su grupo.
* **Estado 3: Mutable (Operación Normal)**
    * **Cuerpo:** Selector con alternativas disponibles. Aviso de *"Sujeto a aprobación"* si aplica.
    * **Acciones:** Botón "Guardar Cambios" (Dispara Optimistic UI).
* **Estado 4: Bloqueo Disciplinario / Ayuda (Autoridad)**
    * **Cuerpo:** Mensaje de intervención administrativa.

## 5. Estándares Globales de UI/UX
* **Notificaciones:** Prohibido usar `alert()`. Uso estricto de `useToast()`.
* **Diálogos Destructivos:** Prohibido usar `confirm()`. Uso estricto de `AlertDialog`.
* **Tematización:** Soporte obligatorio para modo claro/tenue/oscuro usando utilidades Tailwind (ej. `dark:bg-slate-900`) en todos los componentes.

## 6. Estructura de Archivos (Feature-Sliced Design)

```Plaintext
src/app/[residenciaId]/elegir-horarios-comida/
├── page.tsx                     
├── layout.tsx                   
├── _components/                 
│   ├── BarraSuplantacion.tsx    
│   ├── CarruselCalendario.tsx   
│   ├── CarruselDiario.tsx       
│   ├── TarjetaComida/           
│   │   ├── TarjetaSuperficie.tsx 
│   │   └── CajonDetalle.tsx     
│   ├── Modales/
│   │   ├── ModalAusencia.tsx
│   │   └── ModalExcepcion.tsx
│   ├── BannerNovedades.tsx      
│   └── BotonAccionRadial.tsx    
├── _actions/                    
│   ├── upsertExcepcion.ts        
│   ├── upsertAusenciaLote.ts
│   ├── obtenerHorarioDiario.ts  
│   ├── obtenerCargaHorarios.ts
│   ├── obtenerUsuariosSuplantables.ts
│   └── enviarMensaje.ts
├── _lib/                    
│   ├── densificadorCapa0.ts        # Transforma la vista dispersa en densa (Tu punto 3)
│   ├── interseccionAusencias.ts    # Lógica espacial/temporal de ausencias en lote
│   ├── muroMovil.ts                # Evaluación estática de cierres (Tu punto 2)
│   ├── motorCascada.ts             # Aplica reglas de precedencia (Fail-Close)
│   └── orquestadorUI.ts            # Función principal que llama a las 4 anteriores y formatea el DTO
├── _hooks/                      
│   ├── useHorarioDia.ts            # Hook de TanStack Query para objetos de UI
│   ├── useHorariosStore.ts         # Hook de Zustand para estado de cliente entre componentes
│   ├── useUsuariosSuplantables.ts  # Hook de TanStack Query para los usuarios suplantables si aplica
│   └── useMutacionOptimista.ts     # Hook de TanStack Query para las mutaciones
└── _types/
    └── index.ts

```

