## Plan: Modulo Semanarios End-to-End

Implementar el modulo semanarios completo segun blueprint: contratos compartidos, Cloud Function callable con OCC + upcasting + validacion de eficacia, UI mobile-first con agenda vertical y bottom sheet, y permisos por rol (self, delegado asistente, solo lectura director). Se reutilizan esquemas existentes de elecciones/usuarios y patrones de seguridad/logging ya presentes en functions.

**Steps**
1. Fase 1 - Contratos y constantes compartidas (bloqueante)
1.1 Crear DTOs del modulo en `shared/schemas/semanarios/semanario.dto.ts`:
- `SemanarioReadDTOSchema`
- `UpsertSemanarioPayloadSchema`
- tipos inferidos para frontend/functions.
1.2 Reusar `SemanarioUsuarioSchema` y `SemanaIsoSchema` desde `shared/schemas/elecciones/domain.schema.ts` y `shared/schemas/fechas.ts` para evitar duplicacion de dominio.
1.3 Agregar constantes de query key/ruta de dominio en `shared/models/types.ts` (ej. semanario query key) para unificar frontend.

2. Fase 2 - Autorizacion y modelo de acceso objetivo (bloqueante)
2.1 Definir helper de permisos para semanarios en functions con reglas:
- residente/invitado: solo self
- asistente: solo usuarios asistidos + self si aplica
- director: lectura global, escritura prohibida
- admin/master: no tienen acceso a módulo de semanarios.
2.2 El permiso de asistente no tiene un flag directo en el perfil, sino que se determina por la exitencia de un usuario asistido. El asistente puede actuar como su usuario asistido en el módulo de semanarios.

3. Fase 3 - Cloud Function de escritura (bloqueante)
3.1 Crear `functions/src/semanarios/semanario.service.ts` con logica pura de negocio:
- resolver `semanaIsoCalculada` con upcasting temporal automatico
- validar eficacia de cambios (regla critica #3) calculando ultima fecha impactada por dia modificado contra fecha de corte servidor
- aplicar OCC con `lastUpdatedAt` vs `updatedAt` persistido
- construir mutacion atomica por sintaxis de puntos (`semanarios.{semana}` + `updatedAt`).
3.2 Crear `functions/src/semanarios/upsertSemanario.handler.ts`:
- validar callable/auth
- validar payload zod
- invocar servicio
- mapear errores a `HttpsError` (`invalid-argument`, `permission-denied`, `failed-precondition`, etc.).
3.3 Exportar function desde `functions/src/semanarios/index.ts` y `functions/src/index.ts`.

4. Fase 4 - Lectura backend para cliente (depende de 1 y 2)
4.1 Implementar endpoint de lectura para `SemanarioReadDTO` con control de acceso por rol/target.
4.2 Resolver `updatedAt` serializable ISO para OCC en cliente.
4.3 Asegurar salida fail-close cuando falten keys del usuario frente al singleton (sin inferencias silenciosas de menu no valido).

5. Fase 5 - Frontend data layer (depende de 1, 3 y 4)
5.1 Crear `src/app/[residenciaId]/semanarios/hooks/useSemanarioQuery.ts`:
- fetch de `SemanarioReadDTO`
- cache segregada por `residenciaId + targetUid`
- soporte de initialData opcional.
5.2 Crear `src/app/[residenciaId]/semanarios/hooks/useUpsertSemanarioMutation.ts`:
- llamada a callable `upsertSemanario`
- envio de `lastUpdatedAt`
- manejo de conflictos OCC con mensaje recuperable
- invalidacion de query key semanarios tras success.

6. Fase 6 - UI mobile-first del modulo (depende de 5)
6.1 Crear ruta `src/app/[residenciaId]/semanarios/page.tsx` con guard de acceso y montaje del contenedor.
6.2 Crear `src/app/[residenciaId]/semanarios/components/SemanarioContainer.tsx` como orquestador:
- cruza singleton de residencia (tiempos activos) con semanario del usuario objetivo
- renderiza agenda vertical de lunes a domingo.
6.3 Crear `AgendaVertical.tsx` y `TiempoComidaCard.tsx`:
- iterador principal basado en singleton
- estado “No configurado” cuando falta eleccion local.
6.4 Crear `AlternativasBottomSheet.tsx`:
- un solo nivel, sin scroll interno
- seleccion actualiza estado local y autocierra.
6.5 Incluir selector de usuario objetivo (director/asistente) en esta vista:
- director: solo lectura (controles disabled)
- asistente con delegacion valida: lectura/escritura
- residente/invitado: self.
6.6 Agregar accion Guardar que dispara mutacion y redirige a Home tras success.

7. Fase 7 - Integracion y pruebas (depende de 3, 4, 5, 6)
7.1 Functions tests con emulador:
- autoridad por rol y target
- upcasting temporal
- validacion critica #3 (casos que deben rechazar)
- OCC conflictivo (`failed-precondition`)
- escritura atomica por campo y no reemplazo total de documento.
7.2 Frontend tests/manual QA:
- flujo completo mobile (abrir sheet, cambiar opcion, guardar)
- cache/invalidation TanStack
- director solo lectura
- asistente delegado editable
- fail-close visible para tiempos no configurados.
7.3 Verificacion de regresion en modulo elecciones:
- lectura de `usuario.semanarios` sigue intacta
- cascada CAPA4 sin cambios de contrato.

8. Fase 8 - Despliegue seguro y migracion (depende de 7)
8.1 Publicar Cloud Function y versionar contrato DTO.
8.2 Monitorear errores de validacion/OCC en logs los primeros dias.
8.3 Mantener fallback de UI con mensajes accionables para conflictos de concurrencia.

**Relevant files**
- `shared/schemas/elecciones/domain.schema.ts` — fuente actual de `SemanarioUsuarioSchema` y `DiccionarioSemanariosSchema` para reutilizar, no duplicar.
- `shared/schemas/usuarios.ts` — campo `semanarios` existente en el documento de usuario.
- `shared/schemas/usuariosAsistentes.ts` — ampliar permisos con llave de gestion semanarios.
- `shared/schemas/fechas.ts` — `SemanaIsoSchema` para claves de semana.
- `shared/models/types.ts` — constantes compartidas de query key/identificadores.
- `shared/schemas/semanarios/semanario.dto.ts` — nuevo contrato de lectura/escritura (nuevo).
- `functions/src/common/security.ts` — autenticacion callable y perfil del caller.
- `functions/src/common/logging.ts` — auditoria tecnica de acciones.
- `functions/src/horarios/index.ts` — referencia de OCC/transaccion y mapeo de errores.
- `functions/src/semanarios/semanario.service.ts` — reglas de negocio completas semanario (nuevo).
- `functions/src/semanarios/upsertSemanario.handler.ts` — callable handler (nuevo).
- `functions/src/semanarios/index.ts` — export del dominio functions (nuevo).
- `functions/src/index.ts` — registro global de export para deploy.
- `src/app/[residenciaId]/semanarios/page.tsx` — entrada de ruta y guard.
- `src/app/[residenciaId]/semanarios/hooks/useSemanarioQuery.ts` — lectura y cache.
- `src/app/[residenciaId]/semanarios/hooks/useUpsertSemanarioMutation.ts` — mutacion + OCC UX.
- `src/app/[residenciaId]/semanarios/components/SemanarioContainer.tsx` — orquestacion UI/estado.
- `src/app/[residenciaId]/semanarios/components/AgendaVertical.tsx` — agenda semanal vertical.
- `src/app/[residenciaId]/semanarios/components/TiempoComidaCard.tsx` — tarjeta por tiempo.
- `src/app/[residenciaId]/semanarios/components/AlternativasBottomSheet.tsx` — selector de opciones.

**Verification**
1. Ejecutar typecheck en raiz y en functions sin errores.
2. Probar callable `upsertSemanario` en emulador con 4 perfiles: residente, asistente delegado, director, admin/master.
3. Verificar escenario OCC: dos clientes editan la misma semana; el segundo recibe `failed-precondition`.
4. Verificar upcasting: payload con semana historica se guarda en semana actual de corte.
5. Verificar validacion critica #3 con fixtures de dias que ya no afectan comensales (rechazo esperado).
6. Confirmar mutacion atomica: se modifica solo `semanarios.{semana}` y `updatedAt`, sin borrar otras semanas.
7. QA mobile de Bottom Sheet: apertura/cierre, seleccion y autocierre, sin scroll interno.
8. Confirmar redireccion a Home tras guardar exitosamente e invalidacion de cache semanarios.

**Decisions**
- Incluido en esta entrega: Cloud Function callable estricta para escritura (no server action).
- Incluido en esta entrega: validacion critica #3 completa en backend.
- Incluido en esta entrega: selector de usuario objetivo con reglas por rol desde el inicio.
- Incluido en esta entrega: directores con solo lectura.
- Excluido: herramientas de auditoria para usuario final (se mantiene trazabilidad tecnica en logs/solicitudes consolidadas).

**Further Considerations**
1. Definir formalmente la funcion de “fecha de corte del servidor” reutilizable entre elecciones y semanarios para evitar divergencia de reglas temporales.
2. Agregar metrica de conflictos OCC por residencia para detectar friccion operativa y ajustar UX de guardado.
3. Si la validacion critica #3 resulta costosa, usar placeholder para una fase posterior