# Documento de Arquitectura: Módulo de Inscripciones e Invitaciones (Capa 1.5)

Este submódulo gestiona la intención de participación de los usuarios en una `Actividad`. Su diseño abandona los complejos sistemas de alta concurrencia transaccional (tipo *Ticketmaster*) en favor de un modelo de **confianza familiar y aproximación logística**. 

El objetivo principal de este módulo NO es cobrar entradas, sino alimentar con precisión el motor de cálculo de raciones para la "Cascada de la Verdad".

A continuación, se detallan los pilares de su arquitectura:

### 1. Gestión de Identidad Efímera (Shadow Accounts)
**El Desafío:** Permitir la inclusión de personas ajenas a la residencia (amigos, familiares) sin obligarlos a pasar por un flujo de registro complejo, pero manteniendo la trazabilidad para el organizador.

**La Solución Arquitectónica:** * Uso controlado de *Shadow Accounts* (cuentas sombra). Se crearán documentos de usuario mínimos con `tieneAutenticacion=false` y el rol `invitado`.
* **Políticas de Retención:** Para evitar que la colección de usuarios colapse a largo plazo (degradación de índices en Firestore), estas cuentas sombra tienen una caducidad lógica. Un proceso *cron* anual auditará la inactividad y migrará estas identidades y sus historiales a un Data Warehouse (BigQuery) para preservación histórica, purgándolas de la base de datos transaccional primaria.

### 2. Máquina de Estados de la Inscripción y Control de Cupos (OCC)
**El Desafío:** Diferenciar entre una invitación enviada, una silla ocupada y una cancelación, manteniendo sincronizado el límite máximo de la actividad.

**La Solución Arquitectónica:**
* El documento de inscripción muta a través del `EstadoInscripcionEnum`: `invitacion_pendiente` -> `confirmada` -> `rechazada` / `cancelada_por_usuario` / `cancelada_por_organizador`.
* **Desacoplamiento del Token OCC:** La mera creación de una invitación (`invitacion_pendiente`) **no** reserva el cupo. El incremento atómico en Firestore (`FieldValue.increment(1)`) sobre el campo `conteoInscritos` de la Actividad padre se ejecuta **exclusivamente** cuando la inscripción transita al estado `confirmada`. 

### 3. Operaciones Transaccionales y el "Modo Dios" (Bulk Actions)
**El Desafío:** Los organizadores necesitan flexibilizar el sistema en el último minuto (añadir grupos de invitados de golpe o purgar residentes que no asistirán) sin romper los límites matemáticos de la actividad.

**La Solución Arquitectónica:**
* **Gestión en Bloque Atómica:** Las acciones del organizador (`forceAddParticipants`, `kickParticipant`) se ejecutan a través de Server Actions dedicadas utilizando `WriteBatch` o Transacciones de Firestore.
* Si un organizador inyecta 5 usuarios sombra, el sistema intenta sumar `+5` al `conteoInscritos`. Si el resultado supera el `maxParticipantes`, la base de datos rechaza la transacción entera (Rollback atómico) en lugar de hacer inserciones parciales.
* **Trazabilidad:** Toda operación de expulsión forzada (`cancelada_por_organizador`) inyecta un registro en la colección de auditoría para evitar disputas interpersonales.

### 4. Modelo Híbrido de Demanda (Nominal vs. No Nominal)
**El Desafío:** En un entorno familiar, los asistentes fluctúan y a veces el organizador simplemente sabe que "vienen 10 más" sin tener el tiempo o la necesidad de registrar 10 nombres en la aplicación.

**La Solución Arquitectónica:**
* Se abandona la restricción de que cada plato debe tener un documento de inscripción `InscripcionActividad` en la subcolección.
* Se introduce el concepto de **Demanda No Nominal** mediante el campo `adicionalesNoNominales` en la raíz de la Actividad.
* **Contrato con la Cascada:** El motor de consolidación ignorará por completo la subcolección de inscripciones. Para calcular las raciones a preparar, la Cascada simplemente leerá el documento de la Actividad y aplicará la fórmula O(1): `(conteoInscritos + adicionalesNoNominales)`.

### 5. Estrategia de Frontend y Experiencia de Usuario (UX)
**El Desafío:** Reducir la latencia percibida en las mutaciones de Server Actions y garantizar que la base de datos nunca reciba cargas útiles (payloads) malformadas que consuman tiempo de cómputo innecesario.

**La Solución Arquitectónica:**
* **Single Source of Truth (Validación Simétrica):** Implementación de **React Hook Form** acoplado con `@hookform/resolvers/zod`. Los mismos esquemas `Zod` definidos en la Capa 1 se utilizan para validar los inputs del cliente en tiempo real. Esto bloquea envíos inválidos antes de iniciar la solicitud de red.
* **Gestión de Estado y Mutaciones Optimistas:** Adopción de **TanStack Query (React Query)** para la capa de asincronía.
    * *Caché:* Las listas de inscripciones y el contador de cupos se mantienen en caché, reduciendo las lecturas redundantes a Firestore al navegar entre vistas.
    * *Optimistic UI:* Al hacer clic en "Inscribirme" o "Aceptar Invitación", TanStack Query actualizará la interfaz (sumando temporalmente 1 al contador y mostrando el estado "confirmada") *antes* de que el Server Action termine de ejecutarse. Si la transacción atómica en Firestore falla (ej. por overbooking de último milisegundo), TanStack Query hace un *rollback* automático de la UI y notifica el error.

---

### Resumen de Reglas de Escritura (Security Rules / Server Actions)
1. **Autoinscripción:** Un residente solo puede crear/modificar su propio documento de inscripción. Falla si `actividad.estado != 'inscripcion_abierta'` o si `conteoInscritos >= maxParticipantes`.
2. **Delegación de Invitaciones:** Un residente puede crear registros a nombre de terceros **solo si** `actividad.permiteInvitadosExternos == true`.
3. **Poderes de Organizador:** El `organizadorId` ignora el estado de la actividad (puede inscribir y expulsar incluso si está `inscripcion_cerrada`), pero está sujeto al límite de `maxParticipantes`.