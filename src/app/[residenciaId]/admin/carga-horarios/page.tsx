'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { doc, writeBatch, collection, getFirestore } from 'firebase/firestore';

import { useResidenciaOperativa } from '@/hooks/useResidenciaOperativa';
import { useFirebaseData } from '@/hooks/useFirebaseData';
import { Comedor } from '@/../shared/models/types';
import { HorarioSolicitudComida } from '@/../shared/models/types';
import { TiempoComida, AlternativaTiempoComida } from '@/../shared/models/types';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { app } from '@/lib/firebase'; // Asegúrate que la app de firebase se exporte

// Interfaces para los datos parseados y enriquecidos
interface RawAlternativa {
  nombre: string;
  tipo: 'comedor' | 'paraLlevar' | 'ayuno';
  tipoAcceso: 'abierto' | 'autorizado' | 'cerrado';
  requiereAprobacion: boolean;
  ventanaInicio: string; // "HH:mm"
  iniciaDiaAnterior?: boolean;
  ventanaFin: string; // "HH:mm"
  terminaDiaSiguiente?: boolean;
  horarioSolicitudComidaNombre?: string | null;
  comedorNombre?: string;
  esPrincipal: boolean;
}

interface RawTiempoComida {
  nombre: string;
  nombreGrupo: string;
  ordenGrupo: number;
  dia?: 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo' | null;
  horaEstimada?: string | null; // "HH:mm"
  aplicacionOrdinaria: boolean;
  alternativas: RawAlternativa[];
}

interface EnrichedAlternativa extends RawAlternativa {
  comedorId?: string | null;
  horarioSolicitudComidaId?: string | null;
  error?: string;
}

interface EnrichedTiempoComida extends Omit<RawTiempoComida, 'alternativas'> {
  alternativas: EnrichedAlternativa[];
  error?: string;
}

const CargaHorariosPage = () => {
  const { residenciaId } = useParams() as { residenciaId: string };
  const { residencia } = useResidenciaOperativa();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [enrichedData, setEnrichedData] = useState<EnrichedTiempoComida[]>([]);

  // FASE 2: Cargar catálogos para enriquecimiento
  const { data: comedores, loading: loadingComedores } = useFirebaseData<Comedor>(`residencias/${residenciaId}/comedores`);
  const { data: horarios, loading: loadingHorarios } = useFirebaseData<HorarioSolicitudComida>(`residencias/${residenciaId}/horariosSolicitudComida`);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFile(event.target.files[0]);
      setEnrichedData([]);
    }
  };
  
  // FASE 1 & 2: Parseo y Enriquecimiento
  const processFile = () => {
    if (!file || !comedores || !horarios) return;

    setIsProcessing(true);
    setEnrichedData([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        if (typeof text !== 'string') {
          throw new Error("No se pudo leer el archivo.");
        }
        const jsonData: RawTiempoComida[] = JSON.parse(text);

        // Validación estructural básica
        const dataToEnrich: RawTiempoComida[] = JSON.parse(text);

        if (!Array.isArray(dataToEnrich)) {
          throw new Error("El JSON debe ser un array de Tiempos de Comida.");
        }

        // FASE 2: Enriquecimiento y Validación
        const enriched = dataToEnrich.map((tc): EnrichedTiempoComida => {
          let tiempoComidaError: string | undefined = undefined;

          const principalesCount = tc.alternativas.filter(alt => alt.esPrincipal).length;
          if (principalesCount !== 1) {
            tiempoComidaError = `Debe haber exactamente una alternativa principal (hay ${principalesCount})`;
          }
          
          const timeRegex = /^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/;
          if (tc.horaEstimada && !timeRegex.test(tc.horaEstimada)) {
              tiempoComidaError = (tiempoComidaError ? tiempoComidaError + '; ' : '') + 'Formato de hora estimada inválido.';
          }

          const enrichedAlternativas = tc.alternativas.map((alt): EnrichedAlternativa => {
            let error: string | undefined = undefined;
            let comedorId: string | null = null;
            let horarioId: string | null = null;
            
            if (alt.ventanaInicio && !timeRegex.test(alt.ventanaInicio)) {
                error = (error ? error + '; ' : '') + 'Formato de ventanaInicio inválido.';
            }
            if (alt.ventanaFin && !timeRegex.test(alt.ventanaFin)) {
                error = (error ? error + '; ' : '') + 'Formato de ventanaFin inválido.';
            }

            if (alt.comedorNombre) {
              const comedor = comedores.find(c => c.nombre === alt.comedorNombre);
              if (comedor) {
                comedorId = comedor.id;
              } else {
                error = `Comedor '${alt.comedorNombre}' no encontrado.`;
              }
            }

            if (alt.horarioSolicitudComidaNombre) {
              const horario = horarios.find(h => h.nombre === alt.horarioSolicitudComidaNombre);
              if (horario) {
                horarioId = horario.id;
              } else {
                error = (error ? error + '; ' : '') + `Horario '${alt.horarioSolicitudComidaNombre}' no encontrado.`;
              }
            }

            return {
              ...alt,
              comedorId,
              horarioSolicitudComidaId: horarioId,
              error,
            };
          });

          return {
            ...tc,
            alternativas: enrichedAlternativas,
            error: tiempoComidaError,
          };
        });

        setEnrichedData(enriched);

      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Error al procesar el archivo",
          description: error.message,
        });
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
      toast({
        variant: "destructive",
        title: "Error al leer el archivo",
        description: "No se pudo leer el archivo seleccionado.",
      });
      setIsProcessing(false);
    };

    reader.readAsText(file);
  };
  
  // FASE 4: Ejecución Transaccional
  const handleImport = async () => {
    if (hasErrors || enrichedData.length === 0) return;

    setIsUploading(true);
    const db = getFirestore(app);

    const dataToImport = enrichedData.filter(tc => !tc.error && tc.alternativas.every(alt => !alt.error));
    
    // Chunking: Lógica para dividir en lotes (chunks)
    const chunkSize = 100; // Límite seguro: 1 TC + ~4 Alternativas = 5 escrituras. 100*5=500.
    const chunks = [];
    for (let i = 0; i < dataToImport.length; i += chunkSize) {
      chunks.push(dataToImport.slice(i, i + chunkSize));
    }

    try {
      for (const chunk of chunks) {
        const batch = writeBatch(db);

        chunk.forEach(tcData => {
          // Crear el TiempoComida
          const tiempoComidaRef = doc(collection(db, `residencias/${residenciaId}/tiemposComida`));
          const newTiempoComida: Omit<TiempoComida, 'id'> = {
            nombre: tcData.nombre,
            residenciaId: residenciaId,
            nombreGrupo: tcData.nombreGrupo,
            ordenGrupo: tcData.ordenGrupo,
            dia: tcData.dia,
            horaEstimada: tcData.horaEstimada,
            aplicacionOrdinaria: tcData.aplicacionOrdinaria,
            isActive: true
          };
          batch.set(tiempoComidaRef, newTiempoComida);

          // Crear las Alternativas
          tcData.alternativas.forEach(altData => {
            const alternativaRef = doc(collection(db, `residencias/${residenciaId}/alternativasTiempoComida`));
            const newAlternativa: Omit<AlternativaTiempoComida, 'id'> = {
                nombre: altData.nombre,
                tipo: altData.tipo,
                tipoAcceso: altData.tipoAcceso,
                requiereAprobacion: altData.requiereAprobacion,
                ventanaInicio: altData.ventanaInicio,
                iniciaDiaAnterior: altData.iniciaDiaAnterior,
                ventanaFin: altData.ventanaFin,
                terminaDiaSiguiente: altData.terminaDiaSiguiente,
                horarioSolicitudComidaId: altData.horarioSolicitudComidaId || null,
                tiempoComidaId: tiempoComidaRef.id,
                residenciaId: residenciaId,
                comedorId: altData.comedorId,
                esPrincipal: altData.esPrincipal,
                isActive: true
            };
            batch.set(alternativaRef, newAlternativa);
          });
        });

        await batch.commit();
      }

      toast({
        title: "Importación completada",
        description: `Se han importado ${dataToImport.length} Tiempos de Comida con sus alternativas.`,
      });
      setEnrichedData([]);
      setFile(null);

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error durante la importación",
        description: `Ocurrió un error al guardar en Firestore: ${error.message}`,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const hasErrors = useMemo(() => enrichedData.some(tc => tc.error || tc.alternativas.some(alt => alt.error)), [enrichedData]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Carga Masiva de Horarios</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Paso 1: Seleccionar Archivo JSON</CardTitle>
          <CardDescription>
            Sube un archivo JSON con la estructura de Tiempos de Comida y sus Alternativas.
            Los IDs de 'comedor' y 'horarioSolicitudComida' deben ser reemplazados por 'comedorNombre' y 'horarioSolicitudComidaNombre'.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Input type="file" accept=".json" onChange={handleFileChange} className="max-w-sm" />
          <Button onClick={processFile} disabled={!file || isProcessing || loadingComedores || loadingHorarios}>
            {isProcessing ? 'Procesando...' : (loadingComedores || loadingHorarios ? 'Cargando catálogos...' : 'Procesar Archivo')}
          </Button>
        </CardContent>
      </Card>
      
      {enrichedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Paso 2: Previsualización y Validación</CardTitle>
            <CardDescription>
              Revisa los datos procesados. Las filas con errores se marcarán en rojo.
              Corrige el archivo JSON y vuelve a cargarlo hasta que no haya errores.
            </CardDescription>
            {hasErrors && (
                <Alert variant="destructive">
                    <AlertTitle>Errores encontrados</AlertTitle>
                    <AlertDescription>
                    Se encontraron errores en los datos. Por favor, corrige el archivo de origen y vuelve a procesarlo.
                    </AlertDescription>
                </Alert>
            )}
          </CardHeader>
          <CardContent>
            {/* FASE 3: Previsualización */}
            <div className="max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Tiempo Comida</TableHead>
                    <TableHead>Alternativa</TableHead>
                    <TableHead>Comedor</TableHead>
                    <TableHead>Horario Solicitud</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrichedData.map((tc, index) => (
                    tc.alternativas.map((alt, altIndex) => (
                      <TableRow key={`${index}-${altIndex}`} className={alt.error || tc.error ? 'bg-red-100' : ''}>
                        {altIndex === 0 && <TableCell rowSpan={tc.alternativas.length}>{tc.nombreGrupo}</TableCell>}
                        {altIndex === 0 && <TableCell rowSpan={tc.alternativas.length}>{tc.nombre}</TableCell>}
                        <TableCell>{alt.nombre}</TableCell>
                        <TableCell>{alt.comedorNombre || 'N/A'}</TableCell>
                        <TableCell>{alt.horarioSolicitudComidaNombre || 'N/A'}</TableCell>
                        <TableCell className="font-medium text-red-600">{alt.error || tc.error}</TableCell>
                      </TableRow>
                    ))
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={handleImport} disabled={hasErrors || isUploading || enrichedData.length === 0} className="mt-4">
              {isUploading ? 'Importando...' : 'Importar a Firestore'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CargaHorariosPage;
