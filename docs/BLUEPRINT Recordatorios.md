# Blueprint Arquitectónico: CRUD de Administración de Recordatorios

**Módulo:** Administración / Gestión de Recordatorios
**Objetivo:** Proveer una interfaz para crear, listar, editar y desactivar reglas de recordatorios (RRULE) sin exponer la complejidad del RFC 5545 al usuario final.

---

## 1. Filosofía de Interfaz y Abstracción (V1)

El formulario no debe ser un reflejo exacto del esquema de base de datos. Se debe implementar el patrón **"Presentation Model"**:
* **El usuario ve:** Plantillas predefinidas ("Un solo uso", "Todos los días", "Días específicos de la semana", "Mensual el mismo día").
* **El sistema guarda:** Cadenas estrictas de RRULE y un entero para `duracionDias`.
* **Restricción:** Para la Versión 1, el CRUD no soportará la creación de interfaces complejas como "el segundo martes de cada dos meses". Nos limitaremos a los 4 casos de uso más comunes. Si se requiere algo exótico, se dejará para V2.

## 2. Vista de Listado (Data Table / Master View)

* **Estrategia de Lectura:** La tabla no expande las fechas. Muestra los documentos crudos de la colección `recordatorios`. 
* **Columnas Principales:**
    * Título (y Color)
    * Tipo (`manual`, `cumpleanos`, `sistema`)
    * Patrón de Repetición (Requiere una función utilitaria que lea el string `FREQ=WEEKLY` y devuelva un texto humano: "Semanal").
    * Validez (`fechaInicioValidez` a `fechaFinValidez`).
    * Estado (`activo`).
* **Regla de Visualización:** Los recordatorios de tipo `cumpleanos` o `sistema` se mostrarán en la lista (para visibilidad), pero su botón de "Editar" o "Eliminar" estará deshabilitado, obligando al usuario a gestionarlos desde su origen (ej. Perfil de Usuario).

## 3. Flujo de Creación y Edición (El Formulario)

El componente del formulario (`React Hook Form`) mantendrá un estado intermedio que se traduce al esquema Zod justo antes del envío.

**Campos del Formulario Visual:**
1. **Título:** Máximo 25 caracteres.
2. **Duración en Días:** Input numérico (por defecto 1).
3. **Selector de Patrón:** Dropdown con opciones:
   * *Único:* Pide solo Fecha. (Se guarda sin `reglaRecurrencia`).
   * *Diario:* Pide Rango de Fechas. (`FREQ=DAILY`).
   * *Semanal:* Pide Rango de Fechas + Checkboxes (L, M, M, J, V, S, D). (`FREQ=WEEKLY;BYDAY=MO,TU...`).
   * *Mensual:* Pide Rango de Fechas + Día del mes (1-31). (`FREQ=MONTHLY;BYMONTHDAY=X`).
4. **Color:** Selector visual (paleta predefinida que inyecte un HEX válido).

**Capa de Traducción (Adapter):**
Al presionar "Guardar", una función pura intercepta el estado visual y construye el `CrearRecordatorioPayload` exacto que nuestro esquema Zod exige, inyectando los strings ISO correspondientes.

## 4. Mutaciones y Eliminación

* **Desactivación (Soft Delete):** No implementaremos borrado físico en V1 para evitar inconsistencias en posibles logs. La acción "Eliminar" simplemente ejecutará una mutación parcial (PATCH) estableciendo `activo: false`.
* **Edición de RRULE:** Si el usuario edita el patrón de repetición de un recordatorio existente, la mutación sobrescribe la cadena `RRULE` completa.
* **Caché:** Toda mutación (Crear, Editar, Desactivar) debe disparar un `queryClient.invalidateQueries` en TanStack Query para refrescar la tabla inmediatamente.
* **Server Actions:** Todas las operaciones de escritura pasan por un Server Action que ejecuta `.parse()` del `RecordatorioSchema` antes de interactuar con Firebase Admin SDK.