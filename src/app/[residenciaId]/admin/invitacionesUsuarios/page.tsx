'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/useToast';
import { collection, db, doc, functions, getDoc, getDocs, httpsCallable, limit, onSnapshot, query, where } from '@/lib/firebase';
import { useInfoUsuario } from '@/components/layout/AppProviders';
import { createUsuarioSchema, type ResidenteData, type AsistentePermisos } from 'shared/schemas/usuarios';
import type { RolUsuario } from 'shared/models/types';
import type { Residencia, ConfiguracionResidencia, CampoPersonalizado } from 'shared/schemas/residencia';
import type { CentroDeCosto } from 'shared/schemas/contabilidad';
import type { DietaData } from 'shared/schemas/complemento1';
import {urlAccesoNoAutorizado} from "@/lib/utils";

interface CrearInvitacionResult {
  success: boolean;
  userId?: string;
  invitationCreated?: boolean;
  message?: string;
}

interface ReenviarResult {
  success: boolean;
  message?: string;
}

interface InvitacionListadoItem {
  id: string;
  email: string;
  status: 'pendiente' | 'enviada' | 'error_envio';
  tokenVersion: number;
  expiresAt?: unknown;
  lastSentAt?: unknown;
  lastError?: string;
}

interface UsuarioListadoItem {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  roles: string[];
  tieneAutenticacion: boolean;
  estaActivo: boolean;
  timestampCreacion?: unknown;
}

type RolInvitable = Exclude<RolUsuario, 'master'>;

type InvitationFormState = {
  nombre: string;
  apellido: string;
  nombreCorto: string;
  email: string;
  roles: RolInvitable[];
  tieneAutenticacion: boolean;
  fechaDeNacimiento: string;
  centroCostoPorDefectoId: string;
  puedeTraerInvitados: 'no' | 'si' | 'requiere_autorizacion';
  camposPersonalizados: Record<string, string>;
  residente?: ResidenteData;
  asistente?: AsistentePermisos;
};

const ROLES_DISPONIBLES: RolInvitable[] = ['residente', 'invitado', 'director', 'contador', 'admin', 'asistente'];

const defaultPermisoDetalle = {
  nivelAcceso: 'Ninguna' as const,
  restriccionTiempo: false,
  fechaInicio: null,
  fechaFin: null,
};

const defaultAsistentePermisos: AsistentePermisos = {
  usuariosAsistidos: {},
  gestionActividades: { ...defaultPermisoDetalle },
  gestionInvitados: { ...defaultPermisoDetalle },
  gestionRecordatorios: { ...defaultPermisoDetalle },
  gestionDietas: { ...defaultPermisoDetalle },
  gestionAtenciones: { ...defaultPermisoDetalle },
  gestionAsistentes: { ...defaultPermisoDetalle },
  gestionComedores: { ...defaultPermisoDetalle },
  gestionHorariosYAlteraciones: { ...defaultPermisoDetalle },
  gestionGrupos: { ...defaultPermisoDetalle },
  solicitarComensales: { ...defaultPermisoDetalle },
};

type AsistentePermisoKey = keyof Omit<AsistentePermisos, 'usuariosAsistidos'>;

const ASISTENTE_PERMISOS_KEYS: AsistentePermisoKey[] = [
  'gestionActividades',
  'gestionInvitados',
  'gestionRecordatorios',
  'gestionDietas',
  'gestionAtenciones',
  'gestionAsistentes',
  'gestionComedores',
  'gestionHorariosYAlteraciones',
  'gestionGrupos',
  'solicitarComensales',
];

const ASISTENTE_PERMISOS_LABELS: Record<keyof Omit<AsistentePermisos, 'usuariosAsistidos'>, string> = {
  gestionActividades: 'Actividades',
  gestionInvitados: 'Invitados',
  gestionRecordatorios: 'Recordatorios',
  gestionDietas: 'Dietas',
  gestionAtenciones: 'Atenciones',
  gestionAsistentes: 'Asistentes',
  gestionComedores: 'Comedores',
  gestionHorariosYAlteraciones: 'Horarios y Alteraciones',
  gestionGrupos: 'Grupos',
  solicitarComensales: 'Solicitar Comensales',
};

const defaultResidenteData: ResidenteData = {
  dietaId: '',
  numeroDeRopa: '',
  habitacion: '',
  avisoAdministracion: 'no_comunicado',
};

const initialFormState: InvitationFormState = {
  nombre: '',
  apellido: '',
  nombreCorto: '',
  email: '',
  roles: [],
  tieneAutenticacion: true,
  fechaDeNacimiento: '',
  centroCostoPorDefectoId: '',
  puedeTraerInvitados: 'no',
  camposPersonalizados: {},
  residente: undefined,
};

function normalizeOptionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
      if (nestedValue !== undefined) {
        result[key] = stripUndefinedDeep(nestedValue);
      }
    });
    return result as T;
  }

  return value;
}

function toEpochMs(value: unknown): number {
  if (!value) {
    return 0;
  }

  if (typeof value === 'object') {
    const maybe = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybe.toDate === 'function') {
      return maybe.toDate().getTime();
    }
    if (typeof maybe.seconds === 'number') {
      return maybe.seconds * 1000;
    }
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function formatDateTime(value: unknown): string {
  const ms = toEpochMs(value);
  if (!ms) {
    return 'N/D';
  }
  return new Date(ms).toLocaleString('es-HN', { timeZone: 'UTC' }) + ' UTC';
}

export default function InvitacionesUsuariosPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { roles, residenciaId } = useInfoUsuario();

  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [lastUserId, setLastUserId] = useState('');
  const [formError, setFormError] = useState('');
  const [residencia, setResidencia] = useState<Residencia | null>(null);
  const [configuracionResidencia, setConfiguracionResidencia] = useState<ConfiguracionResidencia | null>(null);
  const [centrosDeCosto, setCentrosDeCosto] = useState<CentroDeCosto[]>([]);
  const [invitacionesRecientes, setInvitacionesRecientes] = useState<InvitacionListadoItem[]>([]);
  const [usuariosRecientes, setUsuariosRecientes] = useState<UsuarioListadoItem[]>([]);

  const [form, setForm] = useState<InvitationFormState>(initialFormState);

  const crearUsuarioInvitacionCallable = useMemo(
    () => httpsCallable(functions, 'crearUsuarioInvitacion'),
    []
  );
  const reenviarInvitacionCallable = useMemo(
    () => httpsCallable(functions, 'reenviarInvitacion'),
    []
  );

  const autorizado = roles.includes('admin') && residenciaId;

  useEffect(() => {
    if (!autorizado) {
      router.push(urlAccesoNoAutorizado("Solo Usuarios administradores tienen acceso a crear nuevos Usuarios"));
    }
  }, [autorizado, router]);

  useEffect(() => {
    const cargarConfiguracion = async () => {
      if (!autorizado || !residenciaId) {
        return;
      }

      setIsLoadingConfig(true);
      try {
        const residenciaRef = doc(db, 'residencias', residenciaId);
        const configRef = doc(db, `residencias/${residenciaId}/configuracion/general`);
        const centrosQuery = query(
          collection(db, 'residencias', residenciaId, 'centrosDeCosto'),
          where('estaActivo', '==', true)
        );

        const [residenciaSnap, configSnap, centrosSnap] = await Promise.all([
          getDoc(residenciaRef),
          getDoc(configRef),
          getDocs(centrosQuery),
        ]);

        if (!residenciaSnap.exists()) {
          throw new Error('No se encontro la residencia del administrador.');
        }

        setResidencia({ id: residenciaSnap.id, ...residenciaSnap.data() } as Residencia);
        setConfiguracionResidencia(configSnap.exists() ? (configSnap.data() as ConfiguracionResidencia) : null);
        setCentrosDeCosto(
          centrosSnap.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as CentroDeCosto))
        );
      } catch (error: any) {
        toast({
          title: 'Error al cargar configuracion',
          description: error?.message || 'No se pudieron cargar los datos auxiliares del formulario.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingConfig(false);
      }
    };

    cargarConfiguracion();
  }, [autorizado, residenciaId, toast]);

  useEffect(() => {
    if (!autorizado || !residenciaId) {
      return;
    }

    const invitacionesQuery = query(
      collection(db, 'invitaciones'),
      where('residenciaId', '==', residenciaId),
      limit(25)
    );
    const usuariosQuery = query(
      collection(db, 'usuarios'),
      where('residenciaId', '==', residenciaId),
      limit(25)
    );

    const unsubInvitaciones = onSnapshot(invitacionesQuery, (snapshot) => {
      const rows = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<InvitacionListadoItem, 'id'>) }))
        .sort((a, b) => toEpochMs(b.lastSentAt || b.expiresAt) - toEpochMs(a.lastSentAt || a.expiresAt));
      setInvitacionesRecientes(rows);
    });

    const unsubUsuarios = onSnapshot(usuariosQuery, (snapshot) => {
      const rows = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<UsuarioListadoItem, 'id'>) }))
        .sort((a, b) => toEpochMs(b.timestampCreacion) - toEpochMs(a.timestampCreacion));
      setUsuariosRecientes(rows);
    });

    return () => {
      unsubInvitaciones();
      unsubUsuarios();
    };
  }, [autorizado, residenciaId]);

  const dietas = useMemo(
    (): Array<DietaData & { id: string }> =>
      configuracionResidencia?.dietas
        ? Object.entries(configuracionResidencia.dietas).map(([id, data]) => ({ id, ...data }))
        : [],
    [configuracionResidencia]
  );

  const camposPersonalizadosActivos = useMemo<CampoPersonalizado[]>(
    () => (residencia?.camposPersonalizadosPorUsuario || []).filter((field) => field.activo),
    [residencia]
  );

  useEffect(() => {
    if (!form.roles.includes('residente')) {
      if (form.residente) {
        setForm((prev) => ({ ...prev, residente: undefined }));
      }
      return;
    }

    if (!form.residente) {
      const dietaPredeterminada = dietas.find((dieta) => dieta.estaActiva && dieta.esPredeterminada)?.id || '';
      setForm((prev) => ({
        ...prev,
        residente: {
          ...defaultResidenteData,
          dietaId: dietaPredeterminada,
        },
      }));
      return;
    }

    if (!form.residente.dietaId) {
      const dietaPredeterminada = dietas.find((dieta) => dieta.estaActiva && dieta.esPredeterminada)?.id;
      if (dietaPredeterminada) {
        setForm((prev) => ({
          ...prev,
          residente: prev.residente
            ? {
                ...prev.residente,
                dietaId: dietaPredeterminada,
              }
            : prev.residente,
        }));
      }
    }
  }, [dietas, form.roles, form.residente]);

  useEffect(() => {
    if (!form.roles.includes('asistente')) {
      if (form.asistente) {
        setForm((prev) => ({ ...prev, asistente: undefined }));
      }
      return;
    }

    if (!form.asistente) {
      setForm((prev) => ({
        ...prev,
        asistente: { ...defaultAsistentePermisos },
      }));
    }
  }, [form.roles, form.asistente]);

  const updateAsistentePermiso = (
    key: AsistentePermisoKey,
    changes: Partial<AsistentePermisos[AsistentePermisoKey]>
  ) => {
    setForm((prev) => {
      if (!prev.asistente) return prev;
      return {
        ...prev,
        asistente: {
          ...prev.asistente,
          [key]: {
            ...prev.asistente[key],
            ...changes,
          },
        },
      };
    });
  };

  if (!autorizado) {
    return null;
  }

  const handleRoleChange = (role: RolInvitable, checked: boolean) => {
    setFormError('');
    setForm((prev) => {
      const nextRoles = checked
        ? ([...new Set([...prev.roles, role])] as RolInvitable[])
        : prev.roles.filter((currentRole) => currentRole !== role);

      return {
        ...prev,
        roles: nextRoles,
        // Ajustar el valor por defecto de `puedeTraerInvitados` cuando se modifica el rol.
        // Si incluye `director` -> 'si', en caso contrario -> 'no'.
        puedeTraerInvitados: nextRoles.includes('director') ? 'si' : 'no',
      };
    });
  };

  const handleCustomFieldChange = (label: string, value: string) => {
    setFormError('');
    setForm((prev) => ({
      ...prev,
      camposPersonalizados: {
        ...prev.camposPersonalizados,
        [label]: value,
      },
    }));
  };

  const handleResidenteChange = <K extends keyof ResidenteData>(field: K, value: ResidenteData[K]) => {
    setFormError('');
    setForm((prev) => ({
      ...prev,
      residente: {
        ...(prev.residente || defaultResidenteData),
        [field]: value,
      },
    }));
  };

  const resetForm = () => {
    setForm(initialFormState);
    setFormError('');
  };

  const handleCrear = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setFormError('');

    try {
      const payloadCandidate = {
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        nombreCorto: form.nombreCorto.trim(),
        email: form.email.trim(),
        roles: form.roles,
        residenciaId,
        tieneAutenticacion: form.tieneAutenticacion,
        estaActivo: true,
        fechaDeNacimiento: form.fechaDeNacimiento || undefined,
        centroCostoPorDefectoId: form.centroCostoPorDefectoId || undefined,
        puedeTraerInvitados: form.puedeTraerInvitados,
        camposPersonalizados: Object.fromEntries(
          Object.entries(form.camposPersonalizados)
            .map(([key, value]) => [key, value.trim()])
            .filter(([, value]) => value.length > 0)
        ),
        residente: form.roles.includes('residente')
          ? {
              dietaId: form.residente?.dietaId || '',
              habitacion: form.residente?.habitacion || '',
              numeroDeRopa: form.residente?.numeroDeRopa || '',
              avisoAdministracion: form.residente?.avisoAdministracion || 'no_comunicado',
            }
          : undefined,
        asistente: form.roles.includes('asistente') ? form.asistente : undefined,
        identificacion: undefined,
        telefonoMovil: undefined,
        universidad: undefined,
        carrera: undefined,
        semanarios: {},
        grupoContableId: '',
        grupoRestrictivoId: '',
        gruposAnaliticosIds: [],
      };

      const validationResult = createUsuarioSchema.safeParse(payloadCandidate);
      if (!validationResult.success) {
        const flattened = validationResult.error.flatten();
        const fieldErrors = Object.entries(flattened.fieldErrors)
          .map(([field, messages]) => `${field}: ${(messages || []).join(', ')}`)
          .join(' | ');
        const message = fieldErrors || flattened.formErrors.join(' | ') || 'Revisa los campos del formulario.';
        setFormError(message);
        setIsSaving(false);
        document.getElementById('crearUsuarioSubmit')?.focus();
        return;
      }

      const profileData = {
        ...validationResult.data,
        identificacion: normalizeOptionalText(''),
        telefonoMovil: normalizeOptionalText(''),
        universidad: normalizeOptionalText(''),
        carrera: normalizeOptionalText(''),
      };

      const callablePayload = stripUndefinedDeep({ profileData });
      console.groupCollapsed('[crearUsuarioInvitacion][UI] payload diagnostics');
      console.log('payload type:', typeof callablePayload);
      console.log('payload keys:', Object.keys(callablePayload));
      console.log('profileData type:', typeof callablePayload.profileData);
      console.log('profileData keys:', Object.keys(callablePayload.profileData || {}));
      console.log('profileData.asistente type:', typeof (callablePayload.profileData as any)?.asistente);
      console.log('profileData.residente type:', typeof (callablePayload.profileData as any)?.residente);
      console.log('roles:', callablePayload.profileData?.roles);
      console.log('residenciaId:', callablePayload.profileData?.residenciaId);
      console.log('email:', callablePayload.profileData?.email);
      console.log('tieneAutenticacion:', callablePayload.profileData?.tieneAutenticacion);
      console.groupEnd();

      const response = await crearUsuarioInvitacionCallable(callablePayload);
      console.log('[crearUsuarioInvitacion][UI] callable response raw:', response);

      const data = response.data as CrearInvitacionResult;
      if (!data.success) {
        throw new Error(data.message || 'No se pudo crear el usuario.');
      }

      setLastUserId(data.userId || '');
      toast({
        title: 'Usuario creado',
        description: data.message || 'Proceso completado correctamente.',
      });
      resetForm();
    } catch (error: any) {
      console.error('[crearUsuarioInvitacion][UI] callable error full:', error);
      console.error('[crearUsuarioInvitacion][UI] callable error details:', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        name: error?.name,
        stack: error?.stack,
      });
      toast({
        title: 'Error al crear usuario',
        description: error?.message || 'Ocurrio un error inesperado.',
        variant: 'destructive',
      });
      document.getElementById('crearUsuarioSubmit')?.focus();
    } finally {
      setIsSaving(false);
    }
  };

  const handleReenviar = async () => {
    if (!lastUserId) {
      toast({
        title: 'UID requerido',
        description: 'Primero crea un usuario con autenticacion o ingresa un UID valido.',
        variant: 'destructive',
      });
      return;
    }

    setIsResending(true);
    try {
      const response = await reenviarInvitacionCallable({ uid: lastUserId });
      const data = response.data as ReenviarResult;
      if (!data.success) {
        throw new Error(data.message || 'No se pudo reenviar.');
      }

      toast({
        title: 'Reenvio solicitado',
        description: data.message || 'La invitacion se reenviara en segundo plano.',
      });
    } catch (error: any) {
      toast({
        title: 'Error al reenviar',
        description: error?.message || 'Ocurrio un error inesperado.',
        variant: 'destructive',
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl py-6">
      <Card>
        <CardHeader>
          <CardTitle>Invitaciones de usuarios</CardTitle>
          <CardDescription>
            Crea usuarios de tu residencia con toda la informacion administrativa requerida. Si el usuario tiene autenticacion,
            recibira un enlace para completar su clave.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingConfig ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando configuracion de residencia...
            </div>
          ) : null}

          {formError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Error de validacion</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <form onSubmit={handleCrear} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={(event) => setForm((prev) => ({ ...prev, nombre: event.target.value }))}
                  required
                  disabled={isSaving || isLoadingConfig}
                />
              </div>
              <div>
                <Label htmlFor="apellido">Apellido</Label>
                <Input
                  id="apellido"
                  value={form.apellido}
                  onChange={(event) => setForm((prev) => ({ ...prev, apellido: event.target.value }))}
                  required
                  disabled={isSaving || isLoadingConfig}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="nombreCorto">Nombre corto</Label>
                <Input
                  id="nombreCorto"
                  value={form.nombreCorto}
                  onChange={(event) => setForm((prev) => ({ ...prev, nombreCorto: event.target.value }))}
                  required
                  disabled={isSaving || isLoadingConfig}
                />
              </div>
              <div>
                <Label htmlFor="email">Correo</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                  disabled={isSaving || isLoadingConfig}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="grid grid-cols-2 gap-3 rounded-md border p-3 md:grid-cols-3">
                {ROLES_DISPONIBLES.map((rol) => (
                  <div key={rol} className="flex items-center gap-2">
                    <Checkbox
                      id={`rol-${rol}`}
                      checked={form.roles.includes(rol)}
                      onCheckedChange={(checked) => handleRoleChange(rol, !!checked)}
                      disabled={isSaving || isLoadingConfig}
                    />
                    <Label htmlFor={`rol-${rol}`} className="font-normal capitalize">
                      {rol}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="fechaDeNacimiento">Fecha de nacimiento</Label>
                <Input
                  id="fechaDeNacimiento"
                  type="date"
                  value={form.fechaDeNacimiento}
                  onChange={(event) => setForm((prev) => ({ ...prev, fechaDeNacimiento: event.target.value }))}
                  disabled={isSaving || isLoadingConfig}
                />
              </div>

              <div>
                <Label htmlFor="centroCostoPorDefectoId">Centro de costo por defecto</Label>
                <Select
                  value={form.centroCostoPorDefectoId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, centroCostoPorDefectoId: value }))}
                  disabled={isSaving || isLoadingConfig}
                >
                  <SelectTrigger id="centroCostoPorDefectoId">
                    <SelectValue placeholder={centrosDeCosto.length > 0 ? 'Seleccione...' : 'Sin centros activos'} />
                  </SelectTrigger>
                  <SelectContent>
                    {centrosDeCosto.map((centro) => (
                      <SelectItem key={centro.id} value={centro.id}>
                        {centro.nombre} ({centro.codigoVisible})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="puedeTraerInvitados">Puede traer invitados</Label>
                <Select
                  value={form.puedeTraerInvitados}
                  onValueChange={(value: 'no' | 'si' | 'requiere_autorizacion') =>
                    setForm((prev) => ({ ...prev, puedeTraerInvitados: value }))
                  }
                  disabled={isSaving || isLoadingConfig}
                >
                  <SelectTrigger id="puedeTraerInvitados">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="si">Si</SelectItem>
                    <SelectItem value="requiere_autorizacion">Requiere autorizacion</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Switch
                id="tieneAutenticacion"
                checked={form.tieneAutenticacion}
                onCheckedChange={(value) => setForm((prev) => ({ ...prev, tieneAutenticacion: value }))}
                disabled={isSaving || isLoadingConfig}
              />
              <Label htmlFor="tieneAutenticacion">
                Usuario con autenticacion (enviar invitacion por correo)
              </Label>
            </div>

            {camposPersonalizadosActivos.length > 0 ? (
              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <h3 className="font-medium">Campos personalizados</h3>
                  <p className="text-sm text-muted-foreground">
                    Se guardaran en el perfil inicial del usuario segun la configuracion de la residencia.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {camposPersonalizadosActivos.map((field) => {
                    const etiqueta = field.configuracionVisual.etiqueta;
                    const value = form.camposPersonalizados[etiqueta] || '';
                    return (
                      <div key={etiqueta} className="space-y-1.5">
                        <Label htmlFor={`campo-${etiqueta}`}>
                          {etiqueta}
                          {field.validacion.esObligatorio ? ' *' : ''}
                        </Label>
                        {field.configuracionVisual.tipoControl === 'textArea' ? (
                          <Textarea
                            id={`campo-${etiqueta}`}
                            placeholder={field.configuracionVisual.placeholder}
                            value={value}
                            onChange={(event) => handleCustomFieldChange(etiqueta, event.target.value)}
                            disabled={isSaving || isLoadingConfig}
                          />
                        ) : (
                          <Input
                            id={`campo-${etiqueta}`}
                            placeholder={field.configuracionVisual.placeholder}
                            value={value}
                            onChange={(event) => handleCustomFieldChange(etiqueta, event.target.value)}
                            disabled={isSaving || isLoadingConfig}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {form.roles.includes('residente') ? (
              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <h3 className="font-medium">Informacion de residente</h3>
                  <p className="text-sm text-muted-foreground">
                    Estos datos son obligatorios cuando el usuario tiene rol residente.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="residente-dieta">Dieta</Label>
                    <Select
                      value={form.residente?.dietaId || ''}
                      onValueChange={(value) => handleResidenteChange('dietaId', value)}
                      disabled={isSaving || isLoadingConfig}
                    >
                      <SelectTrigger id="residente-dieta">
                        <SelectValue placeholder={dietas.length > 0 ? 'Seleccione dieta...' : 'Sin dietas activas'} />
                      </SelectTrigger>
                      <SelectContent>
                        {dietas
                          .filter((dieta) => dieta.estaActiva)
                          .map((dieta) => (
                            <SelectItem key={dieta.id} value={dieta.id}>
                              {dieta.nombre} {dieta.esPredeterminada ? '(Predeterminada)' : ''}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="residente-aviso">Aviso administracion</Label>
                    <Select
                      value={form.residente?.avisoAdministracion || 'no_comunicado'}
                      onValueChange={(value: ResidenteData['avisoAdministracion']) =>
                        handleResidenteChange('avisoAdministracion', value)
                      }
                      disabled={isSaving || isLoadingConfig}
                    >
                      <SelectTrigger id="residente-aviso">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no_comunicado">No comunicado</SelectItem>
                        <SelectItem value="comunicado">Comunicado</SelectItem>
                        <SelectItem value="convivente">Convivente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="residente-habitacion">Habitacion</Label>
                    <Input
                      id="residente-habitacion"
                      value={form.residente?.habitacion || ''}
                      onChange={(event) => handleResidenteChange('habitacion', event.target.value)}
                      disabled={isSaving || isLoadingConfig}
                    />
                  </div>

                  <div>
                    <Label htmlFor="residente-ropa">Numero de ropa</Label>
                    <Input
                      id="residente-ropa"
                      value={form.residente?.numeroDeRopa || ''}
                      onChange={(event) => handleResidenteChange('numeroDeRopa', event.target.value)}
                      disabled={isSaving || isLoadingConfig}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {form.roles.includes('asistente') ? (
              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <h3 className="font-medium">Permisos de asistente</h3>
                  <p className="text-sm text-muted-foreground">
                    Complete los permisos de asistente para controlar acciones que podrá realizar.
                  </p>
                </div>

                <div className="space-y-4">
                  {ASISTENTE_PERMISOS_KEYS.map((key) => {
                    const permiso = form.asistente?.[key];

                    return (
                      <div key={key} className="grid grid-cols-1 gap-3 md:grid-cols-3 items-end">
                        <div className="md:col-span-1">
                          <Label>{ASISTENTE_PERMISOS_LABELS[key]}</Label>
                        </div>
                        <div className="md:col-span-1">
                          <Select
                            value={permiso?.nivelAcceso || 'Ninguna'}
                            onValueChange={(value) =>
                              updateAsistentePermiso(key, { nivelAcceso: value as any })
                            }
                            disabled={isSaving || isLoadingConfig}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Ninguna">Ninguna</SelectItem>
                              <SelectItem value="Propias">Propias</SelectItem>
                              <SelectItem value="Todas">Todas</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-1 flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`asistente-${key}-restriccion`}
                              checked={permiso?.restriccionTiempo ?? false}
                              onCheckedChange={(checked) =>
                                updateAsistentePermiso(key, {
                                  restriccionTiempo: !!checked,
                                  fechaInicio: checked ? permiso?.fechaInicio ?? null : null,
                                  fechaFin: checked ? permiso?.fechaFin ?? null : null,
                                })
                              }
                              disabled={isSaving || isLoadingConfig}
                            />
                            <Label htmlFor={`asistente-${key}-restriccion`} className="font-normal">
                              Restringir tiempo
                            </Label>
                          </div>
                          {permiso?.restriccionTiempo ? (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label htmlFor={`asistente-${key}-inicio`} className="text-xs">
                                  Desde
                                </Label>
                                <Input
                                  id={`asistente-${key}-inicio`}
                                  type="date"
                                  value={permiso?.fechaInicio || ''}
                                  onChange={(e) =>
                                    updateAsistentePermiso(key, {
                                      fechaInicio: e.target.value || null,
                                    })
                                  }
                                  disabled={isSaving || isLoadingConfig}
                                />
                              </div>
                              <div>
                                <Label htmlFor={`asistente-${key}-fin`} className="text-xs">
                                  Hasta
                                </Label>
                                <Input
                                  id={`asistente-${key}-fin`}
                                  type="date"
                                  value={permiso?.fechaFin || ''}
                                  onChange={(e) =>
                                    updateAsistentePermiso(key, {
                                      fechaFin: e.target.value || null,
                                    })
                                  }
                                  disabled={isSaving || isLoadingConfig}
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <Button id="crearUsuarioSubmit" disabled={isSaving || isLoadingConfig} type="submit">
              {isSaving ? 'Guardando...' : 'Crear usuario'}
            </Button>

            {formError ? (
              <p className="text-sm text-destructive">Corrige los errores y vuelve a intentarlo.</p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Reenviar invitacion</CardTitle>
          <CardDescription>
            Limite: un reenvio por minuto por usuario (UID).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="uidReenvio">UID del usuario</Label>
            <Input
              id="uidReenvio"
              value={lastUserId}
              onChange={(event) => setLastUserId(event.target.value)}
              placeholder="UID de Firebase Auth"
            />
          </div>

          <Button variant="secondary" disabled={isResending} onClick={handleReenviar}>
            {isResending ? 'Solicitando...' : 'Reenviar invitacion'}
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Invitaciones recientes</CardTitle>
          <CardDescription>
            Muestra hasta 25 invitaciones de tu residencia para seguimiento operativo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitacionesRecientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay invitaciones recientes.</p>
          ) : (
            <div className="space-y-2">
              {invitacionesRecientes.map((invitacion) => (
                <div key={invitacion.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{invitacion.email}</p>
                    <Badge variant={invitacion.status === 'error_envio' ? 'destructive' : 'secondary'}>
                      {invitacion.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">UID: {invitacion.id}</p>
                  <p className="text-muted-foreground">Version token: {invitacion.tokenVersion}</p>
                  <p className="text-muted-foreground">Ultimo envio: {formatDateTime(invitacion.lastSentAt)}</p>
                  <p className="text-muted-foreground">Expira: {formatDateTime(invitacion.expiresAt)}</p>
                  {invitacion.lastError ? (
                    <p className="text-xs text-destructive">Error: {invitacion.lastError}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Usuarios recien creados</CardTitle>
          <CardDescription>
            Muestra hasta 25 usuarios nuevos de tu residencia para verificacion posterior al alta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usuariosRecientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay usuarios recientes.</p>
          ) : (
            <div className="space-y-2">
              {usuariosRecientes.map((usuario) => (
                <div key={usuario.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{usuario.nombre} {usuario.apellido}</p>
                    <Badge variant={usuario.estaActivo ? 'secondary' : 'outline'}>
                      {usuario.estaActivo ? 'activo' : 'inactivo'}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">{usuario.email}</p>
                  <p className="text-muted-foreground">UID: {usuario.id}</p>
                  <p className="text-muted-foreground">Roles: {(usuario.roles || []).join(', ') || 'N/D'}</p>
                  <p className="text-muted-foreground">
                    Autenticacion: {usuario.tieneAutenticacion ? 'si' : 'no'}
                  </p>
                  <p className="text-muted-foreground">Creado: {formatDateTime(usuario.timestampCreacion)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


