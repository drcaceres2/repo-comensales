"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';
import { auth, db } from '@/lib/firebase';
import {
  UserProfile,
  Residencia,
} from '../../../../../shared/models/types';
import {
  doc,
  getDoc,
  collection,
  writeBatch,
} from 'firebase/firestore';
import { z } from 'zod';

import { Loader2, AlertCircle, Upload, Download } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HorarioSolicitudComidaSchema } from '../../../../../shared/schemas/horariosSolicitudComida';
import { TiempoComidaSchema } from '../../../../../shared/schemas/tiempoComida';
import { AlternativaTiempoComidaSchema } from '../../../../../shared/schemas/alternativasTiempoComida';
import { addLogToBatch } from '@/lib/utils';

// Zod schema for the uploaded JSON structure
const HorarioUploadSchema = z.object({
  tempId: z.string(),
  nombre: HorarioSolicitudComidaSchema.shape.nombre,
  dia: HorarioSolicitudComidaSchema.shape.dia,
  horaSolicitud: HorarioSolicitudComidaSchema.shape.horaSolicitud,
  isPrimary: HorarioSolicitudComidaSchema.shape.isPrimary,
  isActive: HorarioSolicitudComidaSchema.shape.isActive,
});

const TiempoComidaUploadSchema = z.object({
  tempId: z.string(),
  nombre: TiempoComidaSchema.shape.nombre,
  nombreGrupo: TiempoComidaSchema.shape.nombreGrupo,
  ordenGrupo: TiempoComidaSchema.shape.ordenGrupo,
  dia: TiempoComidaSchema.shape.dia,
  horaEstimada: TiempoComidaSchema.shape.horaEstimada,
  aplicacionOrdinaria: TiempoComidaSchema.shape.aplicacionOrdinaria,
  isActive: TiempoComidaSchema.shape.isActive,
});

const AlternativaUploadSchema = z.object({
  horarioTempId: z.string(),
  tiempoTempId: z.string(),
  nombre: AlternativaTiempoComidaSchema.shape.nombre,
  tipo: AlternativaTiempoComidaSchema.shape.tipo,
  tipoAcceso: AlternativaTiempoComidaSchema.shape.tipoAcceso,
  requiereAprobacion: AlternativaTiempoComidaSchema.shape.requiereAprobacion,
  ventanaInicio: AlternativaTiempoComidaSchema.shape.ventanaInicio,
  iniciaDiaAnterior: AlternativaTiempoComidaSchema.shape.iniciaDiaAnterior,
  ventanaFin: AlternativaTiempoComidaSchema.shape.ventanaFin,
  terminaDiaSiguiente: AlternativaTiempoComidaSchema.shape.terminaDiaSiguiente,
  comedorId: AlternativaTiempoComidaSchema.shape.comedorId,
  esPrincipal: AlternativaTiempoComidaSchema.shape.esPrincipal,
  isActive: AlternativaTiempoComidaSchema.shape.isActive,
});

const UploadDataSchema = z.object({
  horarios: z.array(HorarioUploadSchema),
  tiempos: z.array(TiempoComidaUploadSchema),
  alternativas: z.array(AlternativaUploadSchema),
});


function CargaMasivaHorariosPage() {
  const params = useParams<{ residenciaId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { user: authUser, loading: authFirebaseLoading, error: authFirebaseError } = useAuth();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(true);

  const [residenciaDetails, setResidenciaDetails] = useState<Residencia | null>(null);
  const [loadingResidenciaDetails, setLoadingResidenciaDetails] = useState<boolean>(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    if (authFirebaseLoading) return;
    if (authFirebaseError) {
      toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" });
      router.push('/');
      return;
    }
    if (!authUser) {
      router.push('/');
      return;
    }

    const userDocRef = doc(db, "users", authUser.uid);
    setProfileLoading(true);
    getDoc(userDocRef)
      .then((docSnap) => {
        if (docSnap.exists()) {
          const profile = docSnap.data() as UserProfile;
          setUserProfile(profile);
          const userRoles = profile.roles || [];
          const hasAccess = userRoles.includes('admin') && profile.residenciaId === params.residenciaId;
          setIsAuthorized(hasAccess);
           if (!hasAccess) {
             toast({ title: "Acceso Denegado", description: "No tienes permiso para acceder a esta página.", variant: "destructive" });
             router.push(`/${params.residenciaId}`);
           }
        } else {
          setIsAuthorized(false);
          toast({ title: "Error de Perfil", description: "No se encontró tu perfil de usuario.", variant: "destructive" });
          router.push('/');
        }
      })
      .catch((error) => {
        setIsAuthorized(false);
        toast({ title: "Error al Cargar Perfil", description: `No se pudo cargar tu perfil: ${error.message}`, variant: "destructive" });
        router.push('/');
      })
      .finally(() => {
        setProfileLoading(false);
      });

  }, [authUser, authFirebaseLoading, authFirebaseError, toast, router, params.residenciaId]);

  useEffect(() => {
    if (params.residenciaId) {
      setLoadingResidenciaDetails(true);
      const residenciaRef = doc(db, 'residencias', params.residenciaId);
      getDoc(residenciaRef).then(docSnap => {
        if (docSnap.exists()) {
          setResidenciaDetails({ id: docSnap.id, ...docSnap.data() } as Residencia);
        } else {
          setResidenciaDetails(null);
          toast({ title: "Error", description: `No se encontró la residencia.`, variant: "destructive" });
        }
      }).catch(error => {
        toast({ title: "Error", description: "No se pudieron cargar los detalles de la residencia.", variant: "destructive" });
        setResidenciaDetails(null);
      }).finally(() => {
        setLoadingResidenciaDetails(false);
      });
    }
  }, [params.residenciaId, toast]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setFile(files[0]);
    } else {
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "Archivo no seleccionado", description: "Por favor, selecciona un archivo JSON.", variant: "destructive" });
      return;
    }
    if (!residenciaDetails) {
        toast({ title: "Error", description: "No se han cargado los detalles de la residencia.", variant: "destructive" });
        return;
    }

    setIsProcessing(true);
    const fileContent = await file.text();

    try {
      const jsonData = JSON.parse(fileContent);
      const validationResult = UploadDataSchema.safeParse(jsonData);

      if (!validationResult.success) {
        console.error(validationResult.error.flatten());
        toast({
          title: "Error de Validación",
          description: "La estructura del archivo JSON es incorrecta. Revisa la consola para más detalles.",
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

      const { horarios, tiempos, alternativas } = validationResult.data;
      const batch = writeBatch(db);
      const residenciaId = residenciaDetails.id;

      const horariosIdMap = new Map<string, string>();
      horarios.forEach(h => {
        const newDocRef = doc(collection(db, 'horariosSolicitudComida'));
        horariosIdMap.set(h.tempId, newDocRef.id);
        batch.set(newDocRef, { ...h, id: newDocRef.id, residenciaId });
      });

      const tiemposIdMap = new Map<string, string>();
      tiempos.forEach(t => {
        const newDocRef = doc(collection(db, 'tiemposComida'));
        tiemposIdMap.set(t.tempId, newDocRef.id);
        batch.set(newDocRef, { ...t, id: newDocRef.id, residenciaId });
      });
      
      alternativas.forEach(alt => {
        const newDocRef = doc(collection(db, 'alternativasTiempoComida'));
        const horarioSolicitudComidaId = horariosIdMap.get(alt.horarioTempId);
        const tiempoComidaId = tiemposIdMap.get(alt.tiempoTempId);

        if (!horarioSolicitudComidaId || !tiempoComidaId) {
          throw new Error(`No se encontró el ID temporal para la alternativa ${alt.nombre}. Horario ID: ${alt.horarioTempId}, Tiempo ID: ${alt.tiempoTempId}`);
        }
        const { horarioTempId, tiempoTempId, ...rest } = alt;

        batch.set(newDocRef, {
          ...rest,
          id: newDocRef.id,
          residenciaId,
          horarioSolicitudComidaId,
          tiempoComidaId,
        });
      });
      
      addLogToBatch(batch, 'CARGA_MASIVA_HORARIOS', {
        residenciaId,
        details: {
            horariosCount: horarios.length,
            tiemposCount: tiempos.length,
            alternativasCount: alternativas.length,
            fileName: file.name
        }
      });

      await batch.commit();

      toast({
        title: "Carga Exitosa",
        description: `Se han creado ${horarios.length} horarios, ${tiempos.length} tiempos de comida y ${alternativas.length} alternativas.`,
      });
      setFile(null);


    } catch (error: any) {
      console.error("Error processing file:", error);
      toast({
        title: "Error al Procesar",
        description: error.message || "Ocurrió un error desconocido al procesar el archivo.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadSample = () => {
    const sampleData = {
      "horarios": [
        {
          "tempId": "h1",
          "nombre": "Solicitud General",
          "dia": "lunes",
          "horaSolicitud": "10:00",
          "isPrimary": true,
          "isActive": true
        }
      ],
      "tiempos": [
        {
          "tempId": "t1",
          "nombre": "Desayuno",
          "nombreGrupo": "Comidas Principales",
          "ordenGrupo": 1,
          "dia": "lunes",
          "horaEstimada": "08:00",
          "aplicacionOrdinaria": true,
          "isActive": true
        },
        {
          "tempId": "t2",
          "nombre": "Almuerzo",
          "nombreGrupo": "Comidas Principales",
          "ordenGrupo": 2,
          "dia": "lunes",
          "horaEstimada": "13:00",
          "aplicacionOrdinaria": true,
          "isActive": true
        }
      ],
      "alternativas": [
        {
          "horarioTempId": "h1",
          "tiempoTempId": "t1",
          "nombre": "Desayuno en Comedor",
          "tipo": "comedor",
          "tipoAcceso": "abierto",
          "requiereAprobacion": false,
          "ventanaInicio": "07:00",
          "iniciaDiaAnterior": false,
          "ventanaFin": "09:00",
          "terminaDiaSiguiente": false,
          "comedorId": "ID_DEL_COMEDOR_EXISTENTE",
          "esPrincipal": true,
          "isActive": true
        },
        {
          "horarioTempId": "h1",
          "tiempoTempId": "t2",
          "nombre": "Almuerzo para llevar",
          "tipo": "paraLlevar",
          "tipoAcceso": "autorizado",
          "requiereAprobacion": true,
          "ventanaInicio": "12:00",
          "iniciaDiaAnterior": false,
          "ventanaFin": "14:00",
          "terminaDiaSiguiente": false,
          "comedorId": "ID_DEL_COMEDOR_EXISTENTE",
          "esPrincipal": false,
          "isActive": true
        }
      ]
    };

    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(sampleData, null, 2)
    )}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = "horarios_ejemplo.json";

    link.click();
  };


  if (authFirebaseLoading || profileLoading || loadingResidenciaDetails) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Cargando...</span>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive mb-2">Acceso Denegado</h1>
        <p className="mb-4 text-muted-foreground">No tienes los permisos necesarios para ver esta página.</p>
        <Button onClick={() => router.push('/')}>Volver al Inicio</Button>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4 space-y-8">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold">
                Carga Masiva de Horarios: {residenciaDetails?.nombre || ''}
            </h1>
             {residenciaDetails && <p className="text-sm text-muted-foreground">ID Residencia: {residenciaDetails.id}</p>}
        </div>
        <Button onClick={() => auth.signOut().then(()=>router.push('/'))} variant="outline">Cerrar Sesión</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subir Archivo de Horarios</CardTitle>
          <CardDescription>
            Selecciona un archivo JSON para cargar masivamente los horarios, tiempos de comida y sus alternativas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="file-upload">Archivo JSON</Label>
                <Input id="file-upload" type="file" accept=".json" onChange={handleFileChange} />
            </div>
            <div className="flex space-x-2">
                <Button onClick={handleUpload} disabled={isProcessing || !file}>
                    {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {isProcessing ? 'Procesando...' : 'Cargar y Procesar Archivo'}
                </Button>
                <Button onClick={handleDownloadSample} variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Descargar Ejemplo
                </Button>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CargaMasivaHorariosPage;