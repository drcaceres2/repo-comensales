'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
    collection, doc, getDoc, getDocs,
    query, where, orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from '@/components/ui/badge';
import { useToast } from "@/hooks/useToast";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogTrigger,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
    AlertDialogContent, AlertDialogDescription 
} from "@/components/ui/alert-dialog";
import { Loader2, PlusCircle, Trash2, Edit, AlertCircle, Hourglass, Users, XCircle, ArrowRight, Play, Undo, Calendar, Ban } from 'lucide-react';

// Types and Schemas
import {
    Actividad, ActividadId, CentroDeCostoData, TiempoComida,
    ResidenciaId, InscripcionActividad, ActividadEstado, ComedorId, TiempoComidaId
} from 'shared/models/types';
import { Residencia } from 'shared/schemas/residencia';
import { Usuario } from 'shared/schemas/usuarios';
import { ComedorData } from 'shared/schemas/complemento1'
import { ActivityForm } from './ActivityForm';
import { deleteActividad, updateActividadEstado } from './actions';

// Helper to get inscriptions count
const getInscripcionesCount = (inscripciones: InscripcionActividad[], actividadId: ActividadId) => {
    return inscripciones.filter(i => 
        i.actividadId === actividadId && 
        (i.estadoInscripcion === 'inscrito_directo' || i.estadoInscripcion === 'invitado_aceptado')
    ).length;
};
const getInvitacionesCount = (inscripciones: InscripcionActividad[], actividadId: ActividadId) => {
    return inscripciones.filter(i => 
        i.actividadId === actividadId && 
        i.estadoInscripcion === 'invitado_pendiente'
    ).length;
};


function AdminActividadesPage() {
    const params = useParams();
    const router = useRouter();
    const residenciaId = params.residenciaId as ResidenciaId;
    const { toast } = useToast();
    const { user: authUser, loading: authLoading } = useAuth();
    const [isPending, startTransition] = useTransition();

    // Data State
    const [residencia, setResidencia] = useState<Residencia | null>(null);
    const [actividades, setActividades] = useState<Actividad[]>([]);
    const [inscripciones, setInscripciones] = useState<InscripcionActividad[]>([]);
    const [centroCostosList, setCentroCostosList] = useState<CentroDeCostoData[]>([]);
    const [tiemposComidaList, setTiemposComidaList] = useState<(TiempoComida & { id: TiempoComidaId })[]>([]);
    const [comedoresList, setComedoresList] = useState<(ComedorData & { id: ComedorId })[]>([]);

    // UI State
    const [isLoadingPageData, setIsLoadingPageData] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [showActivityForm, setShowActivityForm] = useState(false);
    const [editingActividad, setEditingActividad] = useState<Actividad | null>(null);

    const fetchData = useCallback(async () => {
        if (!residenciaId || !authUser?.uid) return;
        setIsLoadingPageData(true);
        setPageError(null);
        try {
            const configRef = doc(db, "residencias", residenciaId, "configuracion", "general");

            const [actividadesSnap, centroCostosSnap, inscripcionesSnap, configSnap] = await Promise.all([
                getDocs(query(collection(db, "actividades"), where("residenciaId", "==", residenciaId), orderBy("fechaInicio", "desc"))),
                getDocs(query(collection(db, "centrosCosto"), where("residenciaId", "==", residenciaId), where("isActive", "==", true), orderBy("nombre"))),
                getDocs(query(collection(db, 'inscripcionesActividades'), where('residenciaId', '==', residenciaId))),
                getDoc(configRef)
            ]);
            setActividades(actividadesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as Actividad)));
            setCentroCostosList(centroCostosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as CentroDeCostoData)));
            setInscripciones(inscripcionesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as InscripcionActividad)));
            
            if (configSnap.exists()) {
                const configData = configSnap.data();
                
                // Fetch Comedores
                const comedoresRecord = configData.comedores || {};
                const comedoresArray = Object.entries(comedoresRecord).map(([id, data]) => ({
                    id,
                    ...(data as any)
                }));
                setComedoresList(comedoresArray);

                // Fetch Tiempos de Comida
                const esquemaRecord = configData.esquemaSemanal || {};
                const tiemposArray = Object.entries(esquemaRecord).map(([id, data]) => ({
                    id,
                    ...(data as any)
                })).sort((a, b) => (a.grupoComida || 0) - (b.grupoComida || 0)); // Maintain some order if possible
                setTiemposComidaList(tiemposArray);
            } else {
                setComedoresList([]);
                setTiemposComidaList([]);
            }

        } catch (err) {
            console.error("Error fetching admin activities data:", err);
            setPageError(err instanceof Error ? err.message : "Error desconocido al cargar datos.");
        } finally {
            setIsLoadingPageData(false);
        }
    }, [residenciaId, authUser?.uid]);

    useEffect(() => {
        if (!authLoading && authUser) {
            fetchData();
        } else if (!authLoading && !authUser) {
             router.replace('/');
        }
    }, [authLoading, authUser, fetchData, router]);
    
    // --- FORM MANAGEMENT ---
    const handleOpenAddForm = () => {
        setEditingActividad(null);
        setShowActivityForm(true);
    };
    const handleOpenEditForm = (actividad: Actividad) => {
        setEditingActividad(actividad);
        setShowActivityForm(true);
    };
    const handleCloseForm = () => {
        setShowActivityForm(false);
        setEditingActividad(null);
        fetchData(); // Refetch data on close
    };

    // --- ACTIONS ---
    const handleStateChange = (actividadId: ActividadId, newState: ActividadEstado) => {
        startTransition(async () => {
            const result = await updateActividadEstado(actividadId, residenciaId, newState);
             if (result.success) {
                toast({ title: 'Estado de la actividad actualizado' });
                fetchData();
            } else {
                const errorMsg = typeof result.error === 'string' ? result.error : 'Error de validación';
                toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
            }
        });
    };
    
    const getStateButtonStyle = (actividad: Actividad) => {
        const now = new Date();
        const fechaFin = new Date(actividad.fechaFin);

        switch(actividad.estado) {
            case 'borrador': return { label: 'Abrir Inscripción', icon: Play, nextState: 'inscripcion_abierta' as ActividadEstado };
            case 'inscripcion_abierta': 
                if (now > fechaFin) {
                    return { label: 'Confirmar Administración', icon: ArrowRight, nextState: 'solicitada_administracion' as ActividadEstado };
                }
                return { label: 'Cerrar Inscripción', icon: XCircle, nextState: 'inscripcion_cerrada' as ActividadEstado };
            case 'inscripcion_cerrada': return { label: 'Confirmar Administración', icon: ArrowRight, nextState: 'solicitada_administracion' as ActividadEstado };
            case 'cancelada': return { label: 'Reactivar', icon: Undo, nextState: 'borrador' as ActividadEstado };
            default: return null;
        }
    }

    if (isLoadingPageData) { return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>; }
    if (pageError) { return <div className="text-destructive text-center mt-8">{pageError}</div>; }

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-start space-y-4 md:space-y-0">
                 <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Gestionar Actividades</h1>
                    {residencia && <p className="text-muted-foreground italic">para <span className="font-semibold text-primary">{residencia.nombre}</span></p>}
                </div>
                <Button onClick={handleOpenAddForm} disabled={isPending} className="w-full md:w-auto">
                    <PlusCircle className="mr-2 h-5 w-5" /> Añadir Actividad
                </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {actividades.map((act) => {
                    const stateButton = getStateButtonStyle(act);
                    const inscritos = getInscripcionesCount(inscripciones, act.id);
                    const invitados = getInvitacionesCount(inscripciones, act.id);
                    const dateRange = `${new Date(act.fechaInicio).toLocaleDateString()} ${act.fechaInicio !== act.fechaFin ? `- ${new Date(act.fechaFin).toLocaleDateString()}` : ''}`;

                    return (
                        <Card 
                            key={act.id} 
                            className={`flex flex-col relative transition-all duration-300 hover:shadow-lg ${
                                act.estado === 'cancelada' ? 'opacity-60 grayscale-[0.5] bg-muted/20' : ''
                            }`}
                        >
                            <CardHeader className="pb-2">
                                <div className="flex flex-wrap justify-between items-start gap-x-4 gap-y-2">
                                    <div className="space-y-1 flex-grow">
                                        <CardTitle className="text-xl font-bold line-clamp-1">{act.nombre}</CardTitle>
                                        <div className="flex items-center text-sm text-muted-foreground">
                                            <Calendar className="mr-1 h-3 w-3" />
                                            {dateRange}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end space-y-2">
                                        <Badge 
                                            variant={
                                                act.estado === 'borrador' ? 'outline' : 
                                                act.estado === 'cancelada' ? 'destructive' : 'default'
                                            }
                                            className="px-2 py-0.5"
                                        >
                                            {act.estado === 'borrador' && <Hourglass className="mr-1 h-3 w-3 inline" />}
                                            {act.estado === 'cancelada' && <XCircle className="mr-1 h-3 w-3 inline" />}
                                            {act.estado.replace('_', ' ').charAt(0).toUpperCase() + act.estado.replace('_', ' ').slice(1)}
                                        </Badge>
                                        
                                        {/* Inscription Badges */}
                                        {['inscripcion_abierta', 'inscripcion_cerrada', 'solicitada_administracion'].includes(act.estado) && (
                                            <div className="flex space-x-1">
                                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                    <Users className="mr-1 h-3 w-3" />
                                                    {inscritos}
                                                </Badge>
                                                {act.maxParticipantes && (
                                                     <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                                                        / {act.maxParticipantes}
                                                     </Badge>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-grow py-2">
                                <p className="text-sm text-muted-foreground line-clamp-3 min-h-[3rem]">
                                    {act.descripcion || "Sin descripción"}
                                </p>
                                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                     <div className="flex flex-col p-2 bg-muted/40 rounded">
                                        <span className="text-muted-foreground uppercase font-semibold">Tipo Acceso</span>
                                        <span className="font-medium">{act.requiereInscripcion ? 'Inscripción' : 'Directo'}</span>
                                    </div>
                                    <div className="flex flex-col p-2 bg-muted/40 rounded">
                                        <span className="text-muted-foreground uppercase font-semibold">Comedor</span>
                                        <span className="font-medium truncate">
                                            {act.comedorActividad 
                                                ? (comedoresList.find(c => c.id === act.comedorActividad)?.nombre || act.comedorActividad)
                                                : "No asignado"}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="pt-2 pb-4 border-t mt-auto flex flex-col gap-2">
                                {/* First row: Edit and Cancel */}
                                <div className="flex gap-2 w-full">
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="flex-1"
                                        onClick={() => handleOpenEditForm(act)}
                                        disabled={isPending || (act.estado !== 'borrador' && act.estado !== 'inscripcion_abierta')}
                                    >
                                        <Edit className="mr-2 h-4 w-4" /> Editar
                                    </Button>

                                    {act.estado !== 'cancelada' && act.estado !== 'solicitada_administracion' && (
                                         <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button 
                                                    variant="secondary" 
                                                    size="sm" 
                                                    className="flex-1 text-destructive hover:bg-destructive/10"
                                                    disabled={isPending}
                                                >
                                                    <XCircle className="mr-2 h-4 w-4" /> Cancelar
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>¿Está seguro de cancelar?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Se cancelará la actividad "{act.nombre}". 
                                                        {inscritos > 0 && ` Se notificarán a los ${inscritos} inscritos.`}
                                                        {invitados > 0 && ` Se cancelarán las ${invitados} invitaciones pendientes.`}
                                                        Esta acción no se puede deshacer fácilmente.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>No, volver</AlertDialogCancel>
                                                    <AlertDialogAction 
                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        onClick={() => handleStateChange(act.id!, 'cancelada')}
                                                    >
                                                        Sí, Cancelar Actividad
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                </div>

                                {/* Second row (or third col in MD): State Action */}
                                <div className="w-full">
                                    {stateButton && act.estado !== 'cancelada' && (
                                        <Button 
                                            variant="default" 
                                            size="sm" 
                                            className="w-full bg-blue-600 hover:bg-blue-700 h-9"
                                            onClick={() => handleStateChange(act.id!, stateButton.nextState)}
                                            disabled={isPending}
                                        >
                                            <stateButton.icon className="mr-2 h-4 w-4" />
                                            {stateButton.label}
                                        </Button>
                                    )}
                                    
                                    {act.estado === 'cancelada' && stateButton && (
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="w-full h-9"
                                            onClick={() => handleStateChange(act.id!, stateButton.nextState)}
                                            disabled={isPending}
                                        >
                                            <stateButton.icon className="mr-2 h-4 w-4" />
                                            {stateButton.label}
                                        </Button>
                                    )}
                                </div>
                            </CardFooter>
                        </Card>
                    );
                })}
            </div>

            {showActivityForm && (
                <ActivityForm 
                    residenciaId={residenciaId}
                    onClose={handleCloseForm}
                    actividad={editingActividad}
                    tiemposComidaList={tiemposComidaList}
                    centroCostosList={centroCostosList}
                    comedoresList={comedoresList}
                />
            )}
        </div>
    );
}

export default AdminActividadesPage;