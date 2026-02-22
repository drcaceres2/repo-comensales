'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Usuario } from 'shared/schemas/usuarios';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { Loader2, AlertCircle } from 'lucide-react';

export default function CreateMasterUserPage() {
    const { user: authUser, loading: authFirebaseLoading } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [userProfile, setUserProfile] = useState<Usuario | null>(null);
    const [profileLoading, setProfileLoading] = useState<boolean>(true);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
    const { toast } = useToast();
    const router = useRouter();
    const functions = getFunctions();

    // --- useEffect: Handle Auth State & Fetch Profile ---
    useEffect(() => {
        if (authFirebaseLoading) {
            setProfileLoading(true);
            return;
        }

        if (!authUser) {
            setProfileLoading(false);
            setIsAuthorized(false);
            return;
        }

        const fetchProfile = async () => {
            try {
                const userDocRef = doc(db, "usuarios", authUser.uid);
                const docSnap = await getDoc(userDocRef);
                
                if (docSnap.exists()) {
                    const profile = docSnap.data() as Usuario;
                    setUserProfile(profile);
                    const roles = profile.roles || [];
                    setIsAuthorized(roles.includes('master'));
                } else {
                    setIsAuthorized(false);
                }
            } catch (error) {
                console.error("Error fetching user profile:", error);
                setIsAuthorized(false);
            } finally {
                setProfileLoading(false);
            }
        };

        fetchProfile();
    }, [authUser, authFirebaseLoading]);

    // Redirect if not authenticated or not authorized after loading
    useEffect(() => {
        if (!authFirebaseLoading && !profileLoading) {
            if (!authUser) {
                router.replace('/');
            } else if (!isAuthorized) {
                toast({
                    title: 'Acceso Denegado',
                    description: 'Esta página es exclusiva para usuarios con rol de Master.',
                    variant: 'destructive',
                });
                router.replace('/');
            }
        }
    }, [authUser, authFirebaseLoading, profileLoading, isAuthorized, router, toast]);

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

    if (authFirebaseLoading || profileLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Verificando permisos...</p>
            </div>
        );
    }

    if (!isAuthorized) {
        return null; // Redirect handled by useEffect
    }

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

