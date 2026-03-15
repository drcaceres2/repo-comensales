# Diseño de Arquitectura: Módulo de Invitaciones (Pre-Aprovisionamiento "Auth-First" con Sidecar)

**Contexto:** Creación segura de usuarios SaaS delegando la generación de contraseñas al usuario final sin romper la integridad referencial de la base de datos (Regla "Fail-Close").  
**Dependencias:** Firebase Auth, Firestore, Firebase Cloud Functions (2nd Gen), Proveedor de Correos (ESP).

## 1. Orquestación de Creación (Acción del Director)
**Endpoint:** Cloud Function (HTTP o Callable).  
**Flujo:**
1.  **Validación de Intención (`tieneAutenticacion`):**
    * Si es `false` (ej. personas mayores, invitados pasivos): Generar UUID propio. Crear documento en la colección `usuarios` con `estaActivo: true`. Fin del flujo (Síncrono).
    * Si es `true`: Inicia el flujo "Auth-First".
2.  **Paso Auth:** Ejecutar `admin.auth().createUser({ email, displayName, ... })` (sin contraseña). Se obtiene el `uid` nativo definitivo.
3.  **Paso Claims:** Asignar Custom Claims al usuario recién creado usando el `uid` (`usuarioId`, `residenciaId`, `roles`, `ctxTraduccion`, `zonaHoraria`).
4.  **Transacción Firestore (Batch):**
    * Crear `usuarios/{uid}` con estado `tieneAutenticacion: true` y `estaActivo: false`.
    * Crear `invitaciones/{uid}` (Colección Sidecar) con `expiresAt` (Timestamp: ahora + 2 horas) y `tokenVersion: 1`.

## 2. Despacho Asíncrono (Trigger en Segundo Plano)
**Trigger:** Cloud Function `onDocumentCreated` escuchando `invitaciones/{uid}`.  
**Flujo:**
1.  Detectar nuevo documento en `invitaciones`.
2.  Generar un JWT firmado con una clave secreta propia (NO la de Firebase). Payload: `{ uid, v: 1 }`. Expiración: 2 horas.
3.  Ensamblar enlace seguro (ej. `https://comensales.app/aceptar-invitacion?token=...`).
4.  Llamar a la API del ESP (ej. Resend) para despachar el correo transaccional.

## 3. Cierre de Circuito (Aceptación del Usuario)
**Endpoint:** Cloud Function pública o ruta de API en Next.js.  
**Flujo:**
1.  **Recepción:** El usuario envía el JWT y su nueva contraseña en texto plano (vía HTTPS).
2.  **Validación:**
    * Verificar firma criptográfica del JWT y extraer `uid` y `v` (tokenVersion).
    * Leer `invitaciones/{uid}`. Verificar que el documento exista, no haya expirado y que `tokenVersion === v`.
3.  **Consolidación:**
    * Ejecutar `admin.auth().updateUser(uid, { password: nuevaPassword })`.
4.  **Limpieza Transaccional (Batch):**
    * Actualizar `usuarios/{uid}` a `estaActivo: true`.
    * Eliminar (Hard Delete) `invitaciones/{uid}`.

## 4. Recolección de Basura (El Cronjob Fail-Close)
**Trigger:** Cloud Function `onSchedule` (cada 24 horas).  
**Flujo:**
1.  Consultar `invitaciones` donde `expiresAt < now()`.
2.  Por cada documento expirado, ejecutar eliminación en cascada:
    * `admin.auth().deleteUser(uid)`
    * `db.collection('usuarios').doc(uid).delete()`
    * `db.collection('invitaciones').doc(uid).delete()`

## 5. Puntos de Falla y Mitigaciones
* **Header Spoofing:** El middleware (`proxy.ts`) debe purgar cabeceras inyectadas manualmente antes de procesar el token de sesión.
* **Aislamiento de Claves:** El JWT de invitación debe usar una variable de entorno estrictamente separada (ej. `INVITE_JWT_SECRET`).
* **Reenvío de Invitaciones:** No se crean nuevos registros. Se incrementa `tokenVersion` en `invitaciones/{uid}` y se actualiza `expiresAt`, lo que invalida tokens previos y dispara nuevamente el Trigger.