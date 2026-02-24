# Descripción página CRUD novedades propias

## 1. Topología y Renderizado (El Embudos de Datos)

La página utilizará un patrón de hidratación inicial por servidor (Server-Side Rendering) para seguridad y SEO interno, delegando la interactividad a componentes de cliente.

* Ruta: `src/app/[residenciaId]/mis-novedades/page.tsx` (React Server Component).
* Responsabilidad del Servidor:
    1. Verifica la sesión y extrae el autorId de forma criptográficamente segura (token/cookie).
    2. Ejecuta la consulta a Firestore: `where('autorId', '==', myId)` ordenada por `fechaCreacion` descendente, limitada estrictamente a los últimos 50 registros (o 3 meses).
    3. Pasa este arreglo de datos pre-cargados (hidratación) al componente cliente principal.

## 2. Estructura del Cliente (Gestión de Estado)

El componente principal será `<TableroMisNovedades initialData={...} />` (Client Component). Su arquitectura interna se divide así:
* Gestor de Pestañas (Tabs):
    + Pendientes (Activas): Filtra localmente en memoria initialData donde estado === 'pendiente'.
    + Historial: Filtra localmente donde estado !== 'pendiente'. Incluye un botón al final para "Cargar más antiguos" que dispara una Server Action paginada si el usuario necesita ir más allá de los 50 iniciales.
* Motor Optimista (Optimistic UI): Todo el estado de la lista debe estar envuelto en un hook de mutación optimista (TanStack Query). Al crear/editar/eliminar, la UI asume el éxito, renderiza el cambio al instante y hace rollback si el servidor responde con error.

## 3. Componentes Compartidos (Preparación para /gerencia)

Para no duplicar esfuerzo cuando construyamos la vista del Director, diseñaremos dos componentes agnósticos al contexto:

1. `<NovedadCard novedad={data} rolContext="residente" | "gerencia" />`
    * El prop `rolContext` es vital. En modo "residente", el componente sabe que si el estado es pendiente, debe mostrar los botones "Editar" y "Retirar". Si el estado es otro, se bloquea (Read-Only) y muestra la pastilla de estado ("Aprobada", "Rechazada").
    * En un futuro, cuando le pases el modo "gerencia", el componente ocultará el botón "Editar texto" (el director no edita textos ajenos) y mostrará los botones "Aprobar" o "Diferir".
2. `<NovedadFormModal defaultValues={...} onSubmit={...} />`
    * Un formulario "tonto" (Dumb Component). No sabe si está creando o editando, ni sabe si está en la página de novedades o flotando en el Semanario de comidas.
    * Solo recibe valores iniciales (vacíos si es nuevo), valida en cliente con Zod (texto y categoria), y emite el evento onSubmit con el payload crudo.

## 4. Muro de Seguridad (Capa 3 - Server Actions)

El backend de esta página se compondrá de tres operaciones expuestas como Server Actions. Todas implementan Zero Trust:

* `crearNovedadAction(payload)`:
    + Limpia el payload: Extrae solo texto y categoria.
    + Inyecta: autorId (de la sesión), `residenciaId` (del contexto de URL validado), estado: 'pendiente', `fechaCreacion: now()`.
* `actualizarNovedadAction(novedadId, payload)`:
    + Condición de Carrera: Hace un `.get()` del ID. Si `estado !== 'pendiente'`, aborta y retorna error ("La dirección ya procesó esta novedad").
    + Limpieza: Solo actualiza texto y/o categoria.
* `eliminarNovedadAction(novedadId)`:
    * Soft/Hard Delete: Dado que es un estado pendiente (el Director aún no lo aprueba), puedes hacer un borrado físico (Hard Delete) de la base de datos para ahorrar espacio, previa verificación de que siga en estado pendiente y que el autorId coincida con el usuario solicitante.

## 5. Requisitos de Infraestructura (Firestore)

Para que esta página funcione de forma óptima bajo la regla de segregación, requieres la creación explícita de este índice compuesto en Firebase:

* Colección: `novedadesOperativas` (o la subcolección correspondiente a la residencia).
* Campos: `autorId` (Ascendente) + `fechaCreacion` (Descendente).