# Blueprint: Módulo de Atenciones

## 1. Propósito y Alcance
El módulo de "Atenciones" se centra en el CRUD (Creación, Lectura, Actualización y Eliminación) de peticiones ad-hoc (ej. flores, coffee breaks) que operan fuera de la `Fila Cero`. Aunque la entidad posee un estado de comunicación con la Administración, este módulo es de **solo lectura** para dicho estado. La inclusión en el Snapshot y el cambio a `comunicado` se delega exclusivamente al módulo de "Solicitud Consolidada". Este módulo se creará en la ruta `src\app\[residenciaId]\gerencia\atenciones`

## 2. Modelo de Datos (Interfaz)
El modelo mantiene la separación entre el estado interno (modificable aquí) y el estado de comunicación (modificable en la consolidación, a excepción de las cancelaciones automáticas).

```Typescript
    export interface Atencion {
        id: AtencionId;
        residenciaId: ResidenciaId;
        
        // Trazabilidad
        autorId: UsuarioId; // Restringido a roles: director, asistente
        aprobadorId?: UsuarioId;
        
        // Detalles de la Atención
        nombre: string;
        comentarios?: string;
        timestampCreacion: TimestampString;
        fechaSolicitudComida: FechaIso;
        fechaHoraAtencion: FechaHoraIso;
        
        // Máquinas de Estado
        estado: 'pendiente' | 'aprobada' | 'rechazada';
        avisoAdministracion: 'no_comunicado' | 'comunicado' | 'cancelado';
        
        // Vinculación Financiera
        centroCostoId?: CentroDeCostoId;
    }
```

## 3. Ciclo de Vida y Reglas de Estado
Este módulo gestiona la máquina de estados interna, con efectos secundarios sobre el estado de comunicación únicamente en caso de rechazo.

### Reglas de Modificación en este Módulo:
* **Transiciones de Estado Interno (`estado`):** * Un Director puede cambiar libremente el estado entre `pendiente`, `aprobada` y `rechazada`.
* **Protección del Estado de Comunicación (`avisoAdministracion`):**
  * Es de **solo visualización**. El usuario no puede forzar el estado a `comunicado` desde esta interfaz.
* **Efecto Secundario de Rechazo (Cascada de Cancelación):** * Si una atención (sin importar su estado de comunicación actual) se transiciona a `estado: 'rechazada'`, el sistema automáticamente fuerza `avisoAdministracion: 'cancelado'`.

## 4. Flujo de Trabajo y UI/UX (Patrón Master-Detail)
* La interfaz se estructura en un diseño de "Maestro-Detalle" para priorizar la visualización y gestión rápida.
* Usa React Hook Form con ZOD (resolver) para la validación y gestión de los formularios.

### 4.1. Lista Maestra (Master List)
Muestra el catálogo general de atenciones.
* **Control de Filtros (Segmented Control / Tabs):** Un selector semántico en la parte superior para alternar la vista.
  * *Activas (Por defecto):* Muestra todas las atenciones que NO están rechazadas (`estado !== 'rechazada'`).
  * *Pendientes:* Muestra únicamente las que requieren acción (`estado === 'pendiente'`).
  * *Histórico / Todas:* Muestra el catálogo completo sin filtros.
* **Acciones Rápidas (Inline Buttons):**
  * Si la atención es `pendiente`: Mostrar botones **[Aprobar]** y **[Rechazar]**.
  * Si la atención es `aprobada` y `avisoAdministracion` es `no_comunicado`: Mostrar botón **[Rechazar]**.

### 4.2. Vista de Detalle (Detail View)
Al seleccionar un elemento de la lista maestra, se despliega el detalle completo en el panel adyacente o en un modal/drawer.
* Permite la edición completa de los campos (CRUD) si las reglas de negocio lo permiten.
* Muestra de forma destacada (ej. un *Badge* o *Chip* visual) el estado actual de `avisoAdministracion` para referencia del Director.

## 5. Consideraciones Técnicas de Implementación
* **Validación en Server Actions:** La lógica que intercepta el rechazo y cambia el estado a `cancelado` debe vivir en la Server Action que procesa la mutación de estado, garantizando que la base de datos siempre reciba ambas actualizaciones en la misma transacción atómica.
* **Optimistic UI:** Las acciones rápidas de la lista maestra deben reflejarse instantáneamente en el cliente. Si el usuario filtra por "Pendientes" y hace clic en [Aprobar], la tarjeta debe desaparecer visualmente de esa lista de inmediato usando `useOptimistic`.

## 6. Propuesta de archivos

### Componentes de Servidor (RSC)
* **`AtencionesPage` (page.tsx)**: Obtiene el listado completo de atenciones. Pasa los datos iniciales a la estructura del cliente.
* **`AtencionDetalleData` (components/AtencionDetalleData.tsx)**: Si el detalle requiere datos secundarios pesados, este componente los obtiene basándose en el ID seleccionado.

### Componentes de Cliente (`"use client"`)
* **`AtencionesMasterDetailLayout` (components/AtencionesMasterDetailLayout.tsx)**: El contenedor principal que maneja el estado de la UI (qué ID está seleccionado actualmente para el detalle).
* **`FiltroEstadoAtenciones` (components/FiltroEstadoAtenciones.tsx)**: El Segmented Control (Tabs) que maneja el estado local del filtro (`activas` | `pendientes` | `todas`).
* **`AtencionesMasterList` (components/AtencionesMasterList.tsx)**: Renderiza la lista iterando sobre los datos filtrados.
* **`AtencionQuickActions` (components/AtencionQuickActions.tsx)**: Contiene los botones [Aprobar]/[Rechazar]. Consume la Server Action y maneja el estado `useOptimistic` para retroalimentación instantánea.
* **`AtencionDetailForm` (components/AtencionDetailForm.tsx)**: El panel derecho (o modal) que muestra el formulario de edición de la atención seleccionada y su insignia de estado de comunicación (solo lectura).

### Otros archivos
* **`lib/actions.ts`**: server actions con las escrituras a la base de datos. Las atenciones se almacenan en la colección `residencias/{residenciaId}/atenciones` con un ID autogenerado por Firestore.
* **`lib/consultas.ts`**: componente para instanciar TanStack Query. Tiene los "useMutation", "useQuery", "useQueryClient" y lo que haga falta para gestionar las atenciones.

## 7. Otras consideraciones
* La información de la sesión como el código (auth ID) del usuario, el correo, la residencia (usuarioId, residenciaId, email) se obtienen en page.tsx por medio de obtenerInfoUsuario() y se pasan como props a los componentes de cliente que lo necesiten.
* La validación de los permisos se hace mediante verificarPermisoGestionWrapper("gestionAtenciones") en page.tsx
* Para la escritura en Firestore, la server action vuelve a validar mediante obtenerInfoUsuario() la validez de la sesión. No se vuelven a verificar los permisos.
* La interfaz del modelo de datos de este blueprint es como referencia. Para mejor manejo de todo el módulo se han de crear esquemas ZOD para todo el módulo, y los tipos deben ser inferidos de los esquemas mediante "z.infer()". Los esquemas deben crearse en 'shared/schemas/atenciones.ts'