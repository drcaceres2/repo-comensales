# BLUEPRINT 1: Matriz de Accesos Especiales (Sistema de Privilegios)

**Objetivo:** Interfaz administrativa para elevar o revocar privilegios operativos a usuarios con rol `asistente` (RBAC Dinámico).
**Arquitectura:** Next.js App Router, React Hook Form + Zod, TanStack Query, Firebase Cloud Functions (RPC).

## 1. Árbol de Archivos de la Ruta

    app/[residenciaId]/gestion/
      └── accesos-especiales/
            ├── page.tsx
            ├── consultas.ts
            ├── schema.ts
            └── components/
                  ├── MatrizAccesosClient.tsx
                  ├── SelectorUsuarios.tsx
                  ├── CategoriaPermisosAcordeon.tsx
                  └── FacultadCard.tsx
    shared/schemas/
      └── usuariosAsistentes.ts

## 2. Definición de Componentes y Lógica de UI

* **`page.tsx` (Server Component):** Punto de entrada. Valida la seguridad inicial leyendo la sesión en el servidor. Pasa los datos iniciales al cliente. No contiene mutaciones.
* **`MatrizAccesosClient.tsx`:** * Implementa `useForm` de `react-hook-form` usando el `zodResolver(UpdateMatrizAccesosPayloadSchema)`.
    * Controla el estado general (borrador). Si hay cambios sin guardar (`formState.isDirty`), bloquea el `SelectorUsuarios`.
    * Al hacer *submit*, llama a la mutación de `consultas.ts`.
* **`SelectorUsuarios.tsx`:** Componente de búsqueda y selección del usuario objetivo.
* **`FacultadCard.tsx`:** Componente controlado por RHF (usando `Controller` o `register`). Maneja los *switches* de nivel de acceso y las fechas de restricción temporal.

## 3. Capa de Acceso a Datos (consultas.ts)

    import { useMutation } from '@tanstack/react-query';
    import { httpsCallable } from '@/lib/firebase';
    import { functions } from '@/lib/firebase';
    import { UpdateMatrizAccesosPayload } from './schema';

    export const useActualizarMatrizMutation = () => {
        return useMutation({
            mutationFn: async (payload: UpdateMatrizAccesosPayload) => {
                const actualizarMatriz = httpsCallable(functions, 'actualizarMatrizAccesos');
                const result = await actualizarMatriz(payload);
                return result.data;
            },
            // Lógica de Optimistic UI e invalidación de caché aquí
        });
    };

## 4. Reglas de Negocio en Backend (Cloud Functions: index.ts)

    import { UpdateMatrizAccesosPayloadSchema } from '../../shared/schemas/usuariosAsistentes';

    export const actualizarMatrizAccesos = onCall(async (request: CallableRequest) => {
        const auth = request.auth;
        if (!auth) throw new HttpsError("unauthenticated", "Sesión requerida.");

        // Capa 2: Zod
        const parsed = UpdateMatrizAccesosPayloadSchema.safeParse(request.data);
        if (!parsed.success) throw new HttpsError("invalid-argument", "Payload inválido");

        const { targetUserId, permisos } = parsed.data;

        // Capa 3: Reglas de Negocio (Auto-bloqueo)
        if (auth.uid === targetUserId) {
             throw new HttpsError("permission-denied", "No puedes modificar tus propios accesos.");
        }

        // Verificación Zero-Trust de privilegios del administrador...
        
        // Mutación Quirúrgica (Dot Notation)
        const payloadParaFirestore = {
            "asistente.gestionActividades": permisos.gestionActividades,
            "asistente.gestionInvitados": permisos.gestionInvitados,
            "asistente.gestionRecordatorios": permisos.gestionRecordatorios,
            "asistente.gestionDietas": permisos.gestionDietas,
            "asistente.gestionAtenciones": permisos.gestionAtenciones,
            "asistente.gestionAsistentes": permisos.gestionAsistentes,
            "asistente.gestionGrupos": permisos.gestionGrupos,
            "asistente.gestionHorariosYAlteraciones": permisos.gestionHorariosYAlteraciones,
            "asistente.gestionComedores": permisos.gestionComedores,
            "asistente.solicitarComensales": permisos.solicitarComensales,
        };

        await db.collection("usuarios").doc(targetUserId).update(payloadParaFirestore);
        return { success: true };
    });