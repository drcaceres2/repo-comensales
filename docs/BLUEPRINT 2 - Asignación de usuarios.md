### BLUEPRINT 2: Matriz de Asignación de Usuarios (Directorio)

**Objetivo del Módulo:** Conectar a las identidades (Usuarios) con las reglas (Grupos) mediante un panel de control optimizado para la gestión masiva.

#### 1. Estructura de Datos (El Estado)
Aquí cruzamos dos dominios. El cliente necesita leer del Singleton para saber qué opciones mostrar, pero escribirá exclusivamente en la colección de `Usuarios`.

* **Lectura A (Opciones):** `gruposUsuarios` (desde el Singleton, cacheados en memoria o vía Context/Zustand).
* **Lectura B (Entidades a mutar):** Paginación estricta de la colección `Usuarios`.
* **Mutación (Payload hacia el servidor):**
    ```json
    {
      "operacion": "ASIGNACION_MASIVA",
      "mutaciones": [
        { 
          "usuarioId": "usr_123", 
          "grupoContableId": "grp_cont_1", 
          "grupoRestriccionesId": null,
          "otrosGruposIds": ["grp_inf_4"] 
        }
      ]
    }
    ```

#### 2. Comportamiento de la Interfaz (UI)
* **Patrón Visual:** *Data Grid* (Grilla de datos) densa. Filas = Usuarios; Columnas = Tres selectores independientes (`Contable`, `Disciplinario`, `Otros`).
* **Filtrado Crítico:** Filtros rápidos tipo "Residentes sin grupo contable" o "Residentes con restricciones". Esto es lo que usará el Director el 90% del tiempo para auditar antes del cierre.
* **Modo de Edición:** Edición en línea (*Inline editing*) con un botón maestro de "Guardar Cambios" para empaquetar todo en un solo *payload*.

#### 3. Consideraciones Arquitectónicas y Riesgos
* **Límites de Batch Write:** Firestore permite un máximo de 500 operaciones por Batch. Si un Director selecciona "Seleccionar todos" y aplica un grupo a 600 usuarios, la transacción explotará. **Mitigación:** La Server Action debe hacer *chunking* (dividir el array en bloques de 500) o el frontend debe limitar la selección masiva al tamaño de la página actual.
* **Costos de Lectura (Read Hydration):** No traigas todo el objeto `Usuario` a esta vista. Solo necesitas `id`, `nombreCompleto`, `roles` y los tres campos de grupos. 
* **Idempotencia:** La función de asignación debe ser idempotente. Si se envía el mismo *payload* dos veces por un error de red, el estado final de la base de datos debe ser exactamente el mismo.