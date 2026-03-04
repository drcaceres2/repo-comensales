# BLUEPRINT GESTIÓN DE HORARIOS

Estas son las decisiones inmutables sobre las que construiremos el módulo, diseñadas para mitigar fallos transaccionales, cuellos de botella de rendimiento y problemas de usabilidad en móvil:

## Propósito general

CRUD de las siguientes entidades:
* `HorarioSolicitudData` - Define los horarios que el director puede hacer solicitudes a la administración
* `GrupoComida` - Abstracción de "desayuno", "almuerzo" y "cena". En la mayoría de los casos existirán esos tres grupos.
* `TiempoComida` - Define la combinación de día de la semana con GrupoComida (ejemplo: desayuno lunes, desyuno martes, almuerzo miércoles, etc.)
* `DefinicionAlternativa` - Opción común para un tiempo de comida (ejemplo: almuerzo para llevar, desayuno en bolsa, cena tarde)
* `ConfiguracionAlternativa` - Entidad que asocia un `TiempoComida` con una `DefinicionAlternativa` que es básicamente la alternativa a escoger por los usuarios (en otra página, aquí solo se hace CRUD de ella)

## Persistencia y Transaccionalidad (Backend): 

* Las 5 entidades clave operan como diccionarios (Maps) dentro de un único "Fat Document" en Firestore (residencias/{residenciaId}/configuracion/general). Este documento es un singleton por residencia.
* Toda mutación se hará a través de una Cloud Function usando Control de Concurrencia Optimista (OCC). El cliente enviará la versión actual (expectedVersion); si hay un desajuste por ediciones concurrentes, la transacción se aborta de forma segura.

## Gestión de Estado (Frontend): 

* TanStack Query será el dueño del estado del servidor (fetching, caching, invalidation).
* El formulario y la grilla operarán sobre un Estado Borrador (Draft) local. Las ediciones no mutarán la caché principal hasta que la Cloud Function confirme el 200 OK.

## Diseño de UI Mobile-First: 

* Se implementará un Wizard de 5 pasos para segmentar la carga cognitiva (1. Grupos de Comida, 2. Horarios de Solicitud, 3. Tiempos de Comida, 4. Definiciones de Alternativas, 5. Matriz de Vinculación).
* La Matriz se invierte: Las Filas son los Días de la semana (Scroll natural vertical) y las Columnas son los Grupos de Comida (Scroll horizontal táctil).
* Edición Aislada: Las celdas son botones limpios. La edición detallada de una celda activa un Bottom Sheet (Cajón Inferior) modal para prevenir problemas de táctil ("Fat-Finger") y propagación de eventos.

## Función pura para hidratación

Debido a la complejidad de los mapas en back-end respecto de la información a presentar en la grilla del paso 5 en el front-end, se utiliza una función pura llamada `construirMatrizVistaHorarios` que construye los objetos óptimos para visualización de la grilla.

## Mapa de componentes

Los componentes para desplegar la página son los siguientes:

```Plaintext
\src\app\[residenciaId]\admin\horarios
├── page.tsx                    # Orquestador del Wizard (Maneja el estado del paso actual)
├── _components/                
│   ├── wizard/                 # Los 5 pasos aislados (SRP - Single Responsibility Principle)
│   │   ├── Paso1Grupos.tsx     # CRUD de GruposComida (Desayuno, Almuerzo...)
│   │   ├── Paso2Cortes.tsx     # CRUD de HorarioSolicitudData (La "Fila Cero")
│   │   ├── Paso3Tiempos.tsx    # Generador/CRUD de TiemposComida
│   │   ├── Paso4Catalogo.tsx   # CRUD de DefinicionAlternativa
│   │   └── Paso5Matriz.tsx     # Contenedor final de ensamblaje
│   │
│   ├── matriz/                 # Componentes exclusivos del Paso 5
│   │   ├── Matriz.tsx          # Renderiza las filas (Días) y columnas (Grupos)
│   │   ├── FilaDia.tsx         # Renderiza los cortes del día y el scroll horizontal de comidas
│   │   └── DrawerConfig.tsx    # Drawer inferior para asignar alternativas al TiempoComida
│   │
│   └── shared/                 # Componentes reutilizables entre pasos
│       └── barraProgreso.tsx   # Indicador visual de progreso (1 de 5...)
│
├── _lib                        # Lógica de soporte pura y hooks
│   ├── useHorariosAlmacen.ts   # Hook principal (Zustand/Reducer para el Draft local)
│   ├── useHorariosQuery.ts     # Hook de TanStack Query (Fetching/Mutation a Cloud Functions)
│   └── vistaModeloMapa.ts      # Aquí vive `construirMatrizVistaHorarios` (transform.ts)
```