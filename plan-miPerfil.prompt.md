## Plan: Módulo Mi Perfil completo

Implementar un módulo `mi-perfil` real (reemplazando el placeholder) con lectura hidratada y escritura segura vía Cloud Functions, usando TanStack Query para caché/mutaciones y React Hook Form + Zod para el formulario. El enfoque separa media (Firebase Storage) de data (Firestore), preserva los callables admin existentes, incorpora permisos para interesado y asistente delegado, y endurece reglas de Storage (quitando la configuración abierta actual) para un primer uso seguro multi-tenant.

### Steps
1. Definir contratos compartidos en [shared/schemas/usuarios.ts](shared/schemas/usuarios.ts): `MiPerfilReadDTOSchema`, `UpdateMiPerfilPayloadSchema` y tipos inferidos.
2. Crear callable `updateMiPerfil` en [functions/src/usuarios/index.ts](functions/src/usuarios/index.ts), manteniendo `updateUser` intacto para administración.
3. Exponer la nueva función en [functions/src/index.ts](functions/src/index.ts) y aplicar validación dinámica tenant/OCC/logging en `updateMiPerfil`.
4. Implementar capa servidor de `mi-perfil` en [src/app/mi-perfil/page.tsx](src/app/mi-perfil/page.tsx) usando `obtenerInfoUsuarioServer()` y helpers de [src/lib/acceso-privilegiado.ts](src/lib/acceso-privilegiado.ts).
5. Construir cliente del módulo en `src/app/mi-perfil/*` con `useQuery`/`useMutation`, `useForm`+`zodResolver`, y subida de avatar a `storage`.
6. Verificar configuración de Firebase Storage en el proyecto. Si es necesario reemplazar la configuración actual para que este módulo funcione.
7. Rediseñar reglas en [storage.rules](storage.rules) para ruta `tenants/{residenciaId}/usuarios/{usuarioId}/perfil/avatar_current.jpg`, eliminando permisos globales abiertos.

### Further Considerations
1. El asistente podrá editar campos del asistido, teniendo los mismos permisos que su usuario asistido.
2. La selección de “usuario objetivo” en `/mi-perfil` será por selector UI persistente
