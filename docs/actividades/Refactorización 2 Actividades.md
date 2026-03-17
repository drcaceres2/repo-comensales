# Documento de Arquitectura: Refactorización del Módulo de Actividades (Capa 1)

El rediseño del módulo de Actividades abandona el enfoque de "registro descriptivo" (donde la actividad intentaba modelar cada detalle del evento) para adoptar un enfoque de **"Fronteras y Raciones"**. El objetivo principal de este documento en la base de datos ya no es organizar el evento en sí, sino proporcionar a la "Cascada de la Verdad" (Capa 3) los vectores matemáticos exactos para calcular el consumo de raciones.

A continuación, se detallan los cuatro pilares del cambio arquitectónico:

### 1. Colapso a una Máquina de Estados Única y Lineal
**El Problema Anterior:** Teníamos estados ortogonales. Un documento podía estar "Cerrado a inscripciones" pero "No comunicado a la administración", creando condiciones de carrera y ambigüedad en la UI y en la Cascada.

**La Solución:** Se unificó el ciclo de vida en el `EstadoActividadEnum`.
* El flujo es estrictamente secuencial: `pendiente` -> `aprobada` -> `inscripcion_abierta` -> `inscripcion_cerrada` -> `finalizada`.
* **Impacto en Infraestructura:** La Cascada de la Verdad ahora hace un query trivial. Solo le interesan las actividades cuyo estado sea `>= inscripcion_abierta` y `<= finalizada`. Cualquier otro estado es ruido y se excluye de la lectura en memoria.

### 2. Eliminación del Array de Comidas y Adopción de "Fronteras Cronológicas"
**El Problema Anterior:** Almacenar un `planComidas` con hasta 21 objetos anidados por semana era un anti-patrón NoSQL. Disparaba el tamaño del documento, complicaba las mutaciones y hacía imposible indexar consultas por tiempo de comida.

**La Solución:** Implementación del `FronterasActividadSchema`.
* Se sustituyó el array por cuatro coordenadas exactas: `fechaInicio`, `tiempoComidaInicioId`, `fechaFin` y `tiempoComidaFinId`.
* **Impacto en Infraestructura:** Pasamos de una complejidad de almacenamiento O(N) a **O(1)**. El documento pesa lo mismo si la actividad dura una cena o un mes. La responsabilidad de saber "qué comidas hay en medio" se traslada a la memoria RAM de la Cloud Function (Cascada), que hidratará esos datos cruzando las fronteras con el Singleton de horarios.

### 3. Taxonomía Ortogonal de Acceso y Visibilidad
**El Problema Anterior:** El `ModoAcceso` intentaba definir al mismo tiempo si la gente podía ver la actividad, si podía inscribirse y si era la única opción de comida en la residencia. Un acoplamiento tóxico.

**La Solución:** Separación en tres dimensiones de negocio independientes:
* `visibilidad` (`publica` | `oculta`): Dicta las reglas de renderizado del Feed (UI).
* `tipoAcceso` (`abierta` | `solo_invitacion`): Dicta las reglas del motor de inscripciones. Bloquea o habilita la mutación (Server Action) de autoinscripción.
* `permiteInvitadosExternos` (boolean): Dicta si el árbol de validación debe aceptar que un `usuarioId` inyecte registros a nombre de terceros.

### 4. Resolución de Concurrencia (OCC) y "Demanda No Nominal"
**El Problema Anterior:** Riesgo de *overbooking* por alta concurrencia y contaminación de la colección de usuarios con "Shadow Accounts" (cuentas fantasma) para amigos que solo iban a comer una vez.

**La Solución:** Abandono del conteo dinámico en favor de métricas consolidadas en el documento raíz.
* `conteoInscritos`: Funciona como Token de Control de Concurrencia Optimista (OCC). Solo se incrementa vía transacción atómica de Firestore cuando una inscripción pasa a estado `confirmada`.
* `adicionalesNoNominales`: Absorbe el margen de error logístico y a los invitados sin registro. Evita tener que crear "Shadow Accounts" en la base de datos para usuarios efímeros.
* **Impacto en la Cascada:** La ecuación contable se reduce a `(conteoInscritos + adicionalesNoNominales)`. La Cascada ya no necesita leer la subcolección de inscripciones para saber cuántas raciones facturar a la administración.

---

### Conclusión Estratégica
Con este nuevo modelo, el documento `Actividad` se convierte en un contrato inmutable para la Cascada. El frontend y los *Server Actions* asumen toda la carga de validación estructural, garantizando que cuando un registro toca Firestore, es matemáticamente perfecto y está listo para ser consolidado sin procesamientos pesados.