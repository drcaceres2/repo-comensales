'use client';

// =================================================================================================
// **ADVERTENCIA DE SEGURIDAD IMPORTANTE**
//
// Esta página está diseñada EXCLUSIVAMENTE para el entorno de desarrollo local.
// Su propósito es facilitar la creación inicial de un usuario "master" para configurar el sistema
// por primera vez.
//
// NO DEBE EXPONERSE EN UN ENTORNO DE PRODUCCIÓN O CUALQUIER ENTORNO ACCESIBLE PÚBLICAMENTE.
//
// **Acciones requeridas antes de desplegar a producción:**
// 1. Eliminar el archivo de esta página: `src/app/crear-master/page.tsx`.
// 2. Eliminar la función de Firebase asociada: `createHardcodedMasterUser` en `functions/src/index.ts`.
//
// Exponer esta funcionalidad en producción crearía una vulnerabilidad de seguridad crítica
// que permitiría a cualquier persona crear un usuario con privilegios de administrador.
// =================================================================================================

import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';

export default function CreateMasterUserPage() {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const functions = getFunctions();

    const createHardcodedMasterUserCallable = httpsCallable(functions, 'createHardcodedMasterUser');

    const handleCreateHardcodedMasterUser = async () => {
        setIsLoading(true);
        toast({ title: 'Intentando crear usuario master hardcoded...' });

        try {
            const result = await createHardcodedMasterUserCallable({});
            const data = result.data as { success: boolean; userId?: string; message: string };

            if (data.success) {
                toast({
                    title: '¡Éxito!',
                    description: data.message + (data.userId ? ` (ID: ${data.userId})` : ''),
                    variant: 'default',
                });
            } else {
                toast({
                    title: 'Advertencia',
                    description: data.message || 'No se pudo crear el usuario master.',
                    variant: 'destructive',
                });
            }
        } catch (error: any) {
            console.error('Error al llamar a createHardcodedMasterUser:', error);
            toast({
                title: 'Error al crear usuario master',
                description: error.message || 'Ocurrió un error inesperado.',
                variant: 'destructive',
            });
        }
        setIsLoading(false);
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Crear Usuario Master (Solo Desarrollo Local)</h1>
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6" role="alert">
                <p className="font-bold">Advertencia de Seguridad</p>
                <p>
                    Esta página llama a una función que crea un usuario master con credenciales fijas.
                    Es **EXTREMADAMENTE INSEGURA** y está pensada **SOLO** para la configuración inicial en desarrollo local.
                </p>
                <p className="mt-2">
                    **ACCIÓN REQUERIDA:** DEBES eliminar la función de Firebase <code className="bg-yellow-200 p-1 rounded">createHardcodedMasterUser</code>
                    y asegurar o eliminar esta página antes de desplegar a cualquier entorno que no sea local.
                </p>
            </div>

            <p className="mb-1">
                Al hacer clic en el botón de abajo, se intentará crear un usuario master con las credenciales definidas
                en el archivo <code className="bg-gray-200 p-1 rounded">functions/src/index.ts</code>:
            </p>
            <ul className="list-disc list-inside ml-4 my-2">
                <li>Email: <code className="bg-gray-200 p-1 rounded">drcaceres@gmail.com</code></li>
                <li>Password: <code className="bg-gray-200 p-1 rounded">123456</code></li>
            </ul>
            <p className="mb-4">
                Consulta los logs del emulador de Firebase para más detalles.
            </p>

            <Button onClick={handleCreateHardcodedMasterUser} disabled={isLoading}>
                {isLoading ? 'Procesando...' : 'Crear Usuario Master Hardcoded'}
            </Button>

            <div className="mt-8 p-4 border border-gray-300 rounded">
                <h2 className="text-xl font-semibold mb-2">Siguientes Pasos:</h2>
                <ol className="list-decimal list-inside space-y-1">
                    <li>Verifica que el usuario master se haya creado en el emulador de Firebase (Auth y Firestore).</li>
                    <li>Inicia sesión con las credenciales del usuario master.</li>
                    <li>
                        **CRÍTICO:** Elimina la función <code className="bg-red-200 p-1 rounded">createHardcodedMasterUser</code> de
                        <code className="bg-gray-200 p-1 rounded">functions/src/index.ts</code>.
                    </li>
                    <li>
                        **CRÍTICO:** Elimina o asegura esta página
                        (<code className="bg-gray-200 p-1 rounded">src/app/crear-master/page.tsx</code>).
                    </li>
                    <li>Continúa con el desarrollo utilizando las funciones estándar de gestión de usuarios.</li>
                </ol>
            </div>

            {/* TODO: RIESGO DE SEGURIDAD - ELIMINAR ANTES DE PRODUCCIÓN */}
        </div>
    );
}

