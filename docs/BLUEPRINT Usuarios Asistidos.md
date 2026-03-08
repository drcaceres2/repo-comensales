# BLUEPRINT 2: Gestión de Usuarios Asistidos (Proxy / Impersonation)

**Objetivo:** Interfaz para que la Administración asigne a un Asistente la facultad de operar el sistema en nombre de un Residente o Invitado (Proxy).
**Arquitectura:** Next.js App Router, React Hook Form + Zod, TanStack Query, Firebase Cloud Functions (RPC).

## 1. Árbol de Archivos de la Ruta

    app/[residenciaId]/gestion/
      └── usuarios-asistidos/
            ├── page.tsx
            ├── consultas.ts
            ├── schema.ts
            └── components/
                  ├── GestionAsistidosClient.tsx (Maestro)
                  ├── BuscadorAsistido.tsx (Busca residentes/invitados)
                  ├── ListaAsistentesActuales.tsx
                  └── FormularioNuevaAsignacion.tsx (React Hook Form)
    shared/schemas/
      └── usuariosAsistentes.ts

## 2. Definición de Componentes y Lógica de UI

* **`GestionAsistidosClient.tsx`:** Mantiene el estado del `asistidoId` seleccionado para orquestar la vista.
* **`BuscadorAsistido.tsx`:** Selector tipo Autocomplete. Filtra a usuarios con rol `residente` o `invitado`.
* **`FormularioNuevaAsignacion.tsx`:** * Contiene el `useForm` de RHF integrado con `zodResolver(AsignarAsistentePayloadSchema)`.
    * Valida fechas cruzadas y obligatoriedades en el cliente en tiempo real.
    * Al enviar, empaqueta el payload y dispara la mutación que llama a la Cloud Function.

## 3. Capa de Acceso a Datos (consultas.ts)

    import { useMutation } from '@tanstack/react-query';
    import { httpsCallable } from '@/lib/firebase';
    import { functions } from '@/lib/firebase-client';
    import { AsignarAsistentePayload } from './schema';

    export const useAsignarAsistenteMutation = () => {
        return useMutation({
            mutationFn: async (payload: AsignarAsistentePayload) => {
                const asignarProxy = httpsCallable(functions, 'asignarAsistenteProxy');
                const result = await asignarProxy(payload);
                return result.data;
            },
        });
    };

## 4. Reglas de Negocio en Backend (Cloud Functions: index.ts)

    import { AsignarAsistentePayloadSchema } from '../../shared/schemas/usuariosAsistentes';

    export const asignarAsistenteProxy = onCall(async (request: CallableRequest) => {
        const auth = request.auth;
        if (!auth) throw new HttpsError("unauthenticated", "Sesión requerida.");

        // Capa 2: Zod
        const parsed = AsignarAsistentePayloadSchema.safeParse(request.data);
        if (!parsed.success) throw new HttpsError("invalid-argument", "Payload inválido");

        const { asistidoId, asistenteId, permisos } = parsed.data;

        // Verificación Zero-Trust de privilegios del administrador...

        // Capa 3: Regla Anti-Bucles (Deadlock Proxy)
        const asistidoDoc = await db.collection('usuarios').doc(asistidoId).get();
        const asistidoData = asistidoDoc.data();

        if (!asistidoData) {
            throw new HttpsError("not-found", "El usuario a asistir no existe.");
        }

        if (asistidoData.roles?.includes('asistente')) {
            throw new HttpsError("failed-precondition", "Un Asistente no puede ser asistido por otro Asistente.");
        }

        if (!asistidoData.roles?.includes('residente') && !asistidoData.roles?.includes('invitado')) {
            throw new HttpsError("failed-precondition", "Solo se puede asistir a residentes o invitados.");
        }

        // Mutación Quirúrgica en Diccionario (Dot Notation con variable dinámica)
        const fieldPath = `asistente.usuariosAsistidos.${asistidoId}`;
        
        await db.collection('usuarios').doc(asistenteId).update({
            [fieldPath]: permisos 
        });

        return { success: true };
    });