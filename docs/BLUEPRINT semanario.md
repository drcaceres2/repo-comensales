# BLUEPRINT DE ARQUITECTURA: Módulo de Semanarios
**Proyecto:** comensales.app.  
**Dominio:** Capa 4 (Intención Base / Plantilla de Horarios)  
**Estado:** Aprobado para Implementación

## 1. Visión General y Desacoplamiento
El módulo de "Semanarios" se extrae del "Perfil de Usuario" general. Su único propósito es permitir al residente definir su **Plantilla Base** (el estado ideal e indefinido de su rutina de comidas).

El módulo vivirá en `src\app\[residenciaId]\semanarios`

+ **Aislamiento del Mundo Real:** El módulo es completamente abstracto. No tiene conocimiento de la Capa 0 (Alteraciones), Excepciones o Ausencias. La resolución de conflictos ocurre exclusivamente en el motor de cascada y se visualiza en el Home ("Dashboard de próximos días").
+ **Principio de Responsabilidad Única UI:** No existen "Vistas Previas" ni mapas de colores dentro de este módulo para evitar disonancia cognitiva con el módulo de Elecciones.

## 2. Decisiones de UI/UX (Mobile-First)
+ **Estructura de Agenda Vertical:** Renderizado vertical dinámico de Lunes a Domingo.
+ **Iterador Principal:** La UI se construye iterando sobre el Singleton de Configuración de la Residencia (los `TiemposDeComida` activos), NO sobre el diccionario del usuario.
+ **Interacción (Bottom Sheets):** Cada tiempo de comida es una tarjeta que actúa como botón. Al tocarla, despliega un Bottom Sheet nativo de un solo nivel (sin scroll interno) con las alternativas de menú. Se auto-cierra tras la selección.
+ **Manejo de Vacíos (Fail-Close):** Si el Singleton exige un tiempo de comida que el usuario no tiene en su diccionario local, se renderiza visualmente como "No configurado". El backend asumirá contingencia negativa.

## 3. Contratos de Datos (DTOs)
Para optimizar el payload y evitar exponer datos sensibles del perfil, se establecen esquemas estrictos de lectura y escritura.

**DTO DE LECTURA (Enviado del Servidor al Cliente)**
```TypeScript
export const SemanarioReadDTOSchema = z.object({
  usuarioId: AuthIdSchema,
  semanarios: z.record(SemanaIsoSchema, SemanarioUsuarioSchema),
  updatedAt: z.string().datetime(),
}).strict();
```

**PAYLOAD DE ESCRITURA (Enviado del Cliente al Servidor)**
```TypeScript
export const UpsertSemanarioPayloadSchema = z.object({
  usuarioId: AuthIdSchema,
  semanaIsoEfectiva: SemanaIsoSchema,
  semanario: SemanarioUsuarioSchema,
  lastUpdatedAt: z.string().datetime(), // Obligatorio para OCC
}).strict();
```

## 4. Lógica de Persistencia (Cloud Function: upsertSemanario)
La mutación debe ejecutarse mediante una Cloud Function que aplique las siguientes reglas en orden estricto:

1. **Validación de Autoridad:** El `usuarioId` del payload debe coincidir con el `auth.uid` del token, o el token debe poseer el rol de `asistente` con delegación válida.
2. **Upcasting Temporal Automático:** Si la semana enviada en el payload es menor o igual a la semana actual de corte del servidor, el sistema no rechaza la mutación, sino que automáticamente crea una nueva clave con `semanaIsoActual`. Esto simplifica la escritura, aplica los cambios al futuro inmediato válido y protege (por diseño) cualquier clave histórica que pudiera existir, fungiendo como un upsert seguro.
3. **Validaciones críticas:** Hay que evitar que el usuario haga cambios que no tienen ningún efecto en los comensales. Si el semanario afectado es el "último" que tiene el usuario, la validación de eficacia es superada. Si no es el último, entonces se calcula sobre cada día de la semana modificado, la última "fecha" que afectará el cambio de ese día de la semana. Si la última fecha de alguno de los días ocurre en el pasado, el cambio se rechaza con la advertencia correspondiente al usuario.
4. **Control de Concurrencia Optimista (OCC):** Se consulta el documento base. Si `doc.updatedAt > payload.lastUpdatedAt`, la transacción se aborta (`FAILED_PRECONDITION`).
5. **Escritura Atómica (Sintaxis de Puntos):** La orden de escritura NUNCA debe ser un mutación total.

**EJEMPLO CONCEPTUAL DE MUTACIÓN ATÓMICA**
```TypeScript
const updateData = {
    ['semanarios.' + semanaCalculada]: payload.semanario,
    updatedAt: new Date().toISOString()
};
await db.collection('usuarios').doc(payload.usuarioId).update(updateData);
```

## 5. Flujo de Navegación del Cliente
1. El usuario entra al Taller de Plantillas (Semanarios).
2. Realiza los cambios deseados.
3. Pulsa "Guardar". Se dispara la Cloud Function.
4. Al recibir un estado 200 (Success), el cliente (TanStack Query) purga/invalida la caché del `SemanarioReadDTO`.
5. El usuario es redirigido inmediatamente al Home ("Mundo Real"), donde el motor de cascada recalcula y le muestra la vista previa consolidada de los próximos días.

## 6. Observabilidad y Resolución de Conflictos
+ El documento de usuario y el semanario NO son herramientas de auditoría forense orientadas al usuario final.
+ Cualquier reclamo o disputa sobre raciones se resuelve consultando los "Hechos Inmutables": La base de datos de Solicitudes Consolidadas de la cocina, la cual debe guardar en su metadata el origen exacto de la resolución (Ej. `origen: 'SEMANARIO', versionId: '2026-W14'`).

## 7. Acceso al módulo
Deben tener acceso siempre cada usuario residente o invitado a su propio semanario. Debe tener igualmente acceso a ver y modificar los asistentes respecto de sus usuarios asistidos. Tienen acceso de solo lectura los directores respecto de la totalidad de los residentes e invitados.

## 8. Estructura de archivos
Arquitectura moderna (asumiendo un stack tipo Next.js/React con Firebase/Cloud Functions, dado el uso de TanStack Query y Firestore), esta es la topología de archivos para el módulo de Semanarios.

### 1. Capa de Contratos (Shared / Dominio)
Esta es la frontera. Tanto el cliente como el servidor importan de aquí. Si el contrato cambia, ambos lados se rompen en tiempo de compilación (fail-fast).

+ `shared/domain/semanarios/semanario.dto.ts`
    - **Responsabilidad:** Contener exclusivamente los esquemas Zod (`SemanarioReadDTOSchema`, `UpsertSemanarioPayloadSchema`) y sus tipos TypeScript inferidos. Nada de lógica de UI, nada de base de datos.

### 2. Capa de Persistencia y Negocio (Backend - Cloud Functions)
Aquí se aíslan las reglas de negocio y la mutación atómica.

+ `functions/src/semanarios/upsertSemanario.handler.ts`
    - **Responsabilidad:** Punto de entrada de la Cloud Function. Solo se encarga de recibir el request, validar el payload contra el Zod DTO, extraer el contexto de autenticación y manejar los códigos de error HTTP/RPC.

+ `functions/src/semanarios/semanario.service.ts`
    - **Responsabilidad:** Ejecutar las reglas de negocio puras. Aquí vive la lógica del "Upcasting Temporal Automático", la verificación del OCC (`lastUpdatedAt`) y la inyección de la mutación usando sintaxis de puntos de Firestore. No sabe qué es un protocolo HTTP.

### 3. Capa de Orquestación de Datos (Frontend - Estado)
El pegamento entre la red y la interfaz.

+ `src/app/[residenciaId]/semanarios/hook/useSemanarioQuery.ts`
    - **Responsabilidad:** Hook de TanStack Query para hacer el fetch del `SemanarioReadDTO` y gestionar la caché local.

+ `src/app/[residenciaId]/semanarios/hook/useUpsertSemanarioMutation.ts`
    - **Responsabilidad:** Hook de TanStack Query para enviar el payload de mutación, manejar estados de carga (isPending) e invalidar la caché tras un 200 OK.

### 4. Capa de Presentación (Frontend - UI)
Los componentes "tontos" y el contenedor principal.

+ `src/app/[residenciaId]/semanarios/page.tsx` (o equivalente en tu enrutador)
    - **Responsabilidad:** Punto de entrada de la ruta. Gestiona la protección de la ruta (auth guard) y el layout base de la página. Instancia el contenedor.

+ `src/app/[residenciaId]/semanarios/components/SemanarioContainer.tsx`
    - **Responsabilidad:** Componente "Smart". Consume los hooks de TanStack Query. Cruza los datos del Singleton de la residencia con el diccionario del usuario local. Pasa props puras hacia abajo.

+ `src/app/[residenciaId]/semanarios/components/AgendaVertical.tsx`
    - **Responsabilidad:** Recibir un array de días y renderizar la lista iterativa. No sabe de dónde vienen los datos.

+ `src/app/[residenciaId]/semanarios/components/TiempoComidaCard.tsx`
    - **Responsabilidad:** Mostrar el estado de un bloque (ej. "Almuerzo - Para llevar" o "No configurado"). Intercepta el evento de "tap" para abrir el Bottom Sheet.

+ `src/app/[residenciaId]/semanarios/components/AlternativasBottomSheet.tsx`
    - **Responsabilidad:** Renderizar el modal inferior con las opciones de selección. Emite la intención de cambio hacia arriba (vía callback).

### Evaluación de Riesgo sobre esta Estructura
+ **Punto ciego mitigado:** Si mañana decides cambiar Firestore por PostgreSQL, solo modificas `semanario.service.ts`. La UI ni se entera.
+ **Punto ciego mitigado:** Si el equipo de diseño decide cambiar el Bottom Sheet por un Dropdown clásico en tablets, solo reescribes `AlternativasBottomSheet.tsx` y `TiempoComidaCard.tsx`. La lógica de estado de TanStack Query queda intacta.