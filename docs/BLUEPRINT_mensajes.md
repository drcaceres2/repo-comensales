# Blueprint: Sistema de Mensajería Transversal (comensales.app)
**Estado:** Validado para Implementación
**Patrón:** Centralized Service with Fan-Out Write

## 1. Arquitectura de Datos (Firestore)

### Path de Colección
`residencias/{residenciaId}/mensajes/{mensajeId}`

### Estructura del Documento (Refactorizada)
{
  id: string,                 // Auto-generado por Firestore
  residenciaId: string,       // Sharding por Tenant
  remitenteId: string,        // AuthId del emisor
  remitenteRol: string,       // [residente, director, asistente, sistema]
  destinatarioId: string,     // AuthId del receptor
  asunto: string,             // Enum: solicitud_aprobacion, modificacion_directiva, etc.
  cuerpo: string,             // Máx 500 caracteres
  estado: string,             // [enviado, leido, archivado]
  timestampCreacion: ServerTimestamp, // Para ordenamiento y TTL
  referenciaContexto?: {      // Opcional: Deep Linking
    tipoEntidad: string,      // [excepcion, ausencia, actividad, semanario]
    entidadId: string,        // ID del documento relacionado
    fechaAfectada: string     // ISO Date para posicionamiento en UI
  }
}

## 2. Flujos de Operación

### A. Escritura Unitaria (Residente -> Director)
1. **Origen:** Drawer de módulo (ej. Ausencias).
2. **Acción:** Server Action `enviarMensajePrivado`.
3. **Validación:** Verifica que el `remitenteId` coincide con la sesión y que la `residenciaId` es válida.
4. **Destino:** Crea un documento con `destinatarioId: null` (Bandeja General Adm).

### B. Escritura Masiva (Director -> Todos) [Fan-Out Pattern]
1. **Origen:** Centro de Mensajes (Layout).
2. **Acción:** Server Action `ejecutarBroadcastResidencia`.
3. **Backend:**
   - Recupera lista de `AuthIds` de residentes activos en la residencia.
   - Divide la lista en chunks de 500.
   - Ejecuta `db.batch()` para cada chunk creando documentos individuales.
4. **Consistencia:** Escritura atómica por lote.

### C. Lectura y Notificación (Layout)
1. **Componente:** `NotificationBadge` en `layout.tsx`.
2. **Hidratación:** Cliente-side (TanStack Query) con `staleTime: 1min`.
3. **Query:** `where("destinatarioId", "==", userId).where("estado", "==", "enviado").orderBy("timestampCreacion", "desc")`

## 3. Mapa de Infraestructura (Cloud Configuration)

| Recurso | Configuración / Regla |
| :--- | :--- |
| **Índice Compuesto** | `destinatarioId` (ASC) + `estado` (ASC) + `timestampCreacion` (DESC) |
| **Seguridad (Rules)** | `allow read: if request.auth.uid == resource.data.destinatarioId || (resource.data.destinatarioId == null && user.rol == 'director')` |
| **Escritura** | `allow write: if false` (Bloqueo total, forzado vía Server Actions) |
| **Retención (TTL)** | Habilitar TTL en campo `timestampCreacion` con expiración de 180 días |

## 4. Diagrama de Secuencia Lógica (Broadcast)

Director -> ServerAction: "Aviso: Cambio de Horario"
  Action -> AuthDB: Get All Residents (residencia_id)
  Action -> Firestore: Write Batch 1..N (Individual Messages)
    Firestore -> Resident_A: Inyecta en sub-colección
    Firestore -> Resident_B: Inyecta en sub-colección
  Action -> Director: Success (N mensajes enviados)