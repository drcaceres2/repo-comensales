'use client';

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase'; 
import { collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc, DocumentData, QuerySnapshot, getDoc, DocumentSnapshot, FieldValue, serverTimestamp } from 'firebase/firestore'; // Added getDoc, DocumentSnapshot, FieldValue, serverTimestamp
import { Cliente, PersonaNaturalHonduras, PersonaNaturalExtranjera, PersonaJuridicaHonduras, PersonaJuridicaExtranjera } from '@/../../shared/models/contratos'; // Corrected path, added LogActionType etc.
import { UserProfile, LogActionType, UserId, ResidenciaId } from '@/../../shared/models/types'; // Corrected path
import { writeClientLog } from '@/lib/utils'; 
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface ClientLogWrite {
    userId: UserId;
    actionType: LogActionType;
    timestamp: FieldValue;
    residenciaId?: ResidenciaId;
    targetUid?: UserId | null;
    relatedDocPath?: string;
    details?: string | object;
}

type ClienteFormState = Partial<Cliente>;

const CrearClientePage = () => {
    const [authUser, authFirebaseLoading, authFirebaseError] = useAuthState(auth);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const router = useRouter();
    const [formState, setFormState] = useState<ClienteFormState>({});
    const [clients, setClients] = useState<Cliente[]>([]);
    const [editingClient, setEditingClient] = useState<Cliente | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null); 
    const [profileLoading, setProfileLoading] = useState<boolean>(true);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

    const { toast } = useToast();

    useEffect(() => {
        if (authFirebaseLoading) {
          setProfileLoading(true);
          return;
        }
        if (authFirebaseError) {
          toast({ title: "Error de Autenticación", description: authFirebaseError.message, variant: "destructive" });
          setProfileLoading(false); 
          setUserProfile(null); 
          setProfileError(authFirebaseError.message);
          setIsAuthorized(false);
          return;
        }
        if (!authUser) {
          setProfileLoading(false); 
          setUserProfile(null); 
          setProfileError(null);
          setIsAuthorized(false);
          router.push('/login'); 
          return;
        }
    
        const userDocRef = doc(db, "users", authUser.uid);
        getDoc(userDocRef)
          .then((docSnap: DocumentSnapshot) => { 
            if (docSnap.exists()) {
              const profile = docSnap.data() as UserProfile;
              setUserProfile(profile);
              setProfileError(null);
    
              const roles = profile.roles || [];
              const canAccessPage = roles.includes('master'); 
              setIsAuthorized(canAccessPage);
              setUserRole(roles.includes('master') ? 'master' : null); 
    
              if (!canAccessPage) {
                toast({ title: "Acceso Denegado", description: "No tienes permisos de 'master' para acceder a esta página.", variant: "destructive" });
                router.push('/'); 
              }
            } else {
              setUserProfile(null); 
              setProfileError("Perfil de usuario no encontrado.");
              toast({ title: "Error de Perfil", description: "No se encontró tu perfil de usuario.", variant: "destructive" });
              setIsAuthorized(false);
              router.push('/'); 
            }
          })
          .catch((error) => {
            setUserProfile(null); 
            setProfileError(`Error al cargar el perfil: ${error.message}`);
            toast({ title: "Error al Cargar Perfil", description: `No se pudo cargar tu perfil: ${error.message}`, variant: "destructive" });
            setIsAuthorized(false);
            router.push('/'); 
          })
          .finally(() => {
            setProfileLoading(false);
          });
      }, [authUser, authFirebaseLoading, authFirebaseError, toast, router]);
    

    useEffect(() => {
        if (isAuthorized && userRole === 'master') {
            fetchClients();
        }
    }, [isAuthorized, userRole]); 

    const fetchClients = async () => {
        if (!authUser) return; 
        const q = query(collection(db, 'clientes')); 
        const querySnapshot = await getDocs(q);
        const clientsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cliente));
        setClients(clientsData);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormState((prev: ClienteFormState) => ({ ...prev, [name]: value }));
    };

    const handlePersonaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        let personaType = (formState.personaCliente as any)?.type || 'PersonaNaturalHonduras';

        if (name === "personaType") {
            personaType = value;
            setFormState((prev: ClienteFormState) => ({
                ...prev,
                personaCliente: { type: personaType } as any, 
                representanteLegal: undefined 
            }));
            return;
        }

        setFormState((prev: ClienteFormState) => ({
            ...prev,
            personaCliente: {
                ...(prev.personaCliente as any),
                type: personaType,
                [name]: value,
            },
        }));
    };
    
    const handleRepresentanteLegalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        let representanteType = (formState.representanteLegal as any)?.type || 'PersonaNaturalHonduras';

        if (name === "representanteType") {
            representanteType = value;
            setFormState((prev: ClienteFormState) => ({
                ...prev,
                representanteLegal: { type: representanteType } as any
            }));
            return;
        }
        
        setFormState((prev: ClienteFormState) => ({
            ...prev,
            representanteLegal: {
                ...(prev.representanteLegal as any),
                type: representanteType,
                [name]: value,
            }
        }));
    };

    const formatDNI = (value: string): string => {
        const numbers = value.replace(/[^\d]/g, '');
        let formatted = '';
        if (numbers.length > 0) {
            formatted += numbers.substring(0, Math.min(4, numbers.length));
        }
        if (numbers.length > 4) {
            formatted += '-' + numbers.substring(4, Math.min(8, numbers.length));
        }
        if (numbers.length > 8) {
            formatted += '-' + numbers.substring(8, Math.min(13, numbers.length));
        }
        return formatted;
    };

    const handleDNIChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const formattedDNI = formatDNI(value);
        
        setFormState((prev: ClienteFormState) => ({
            ...prev,
            personaCliente: {
                ...(prev.personaCliente as PersonaNaturalHonduras),
                type: (prev.personaCliente as any)?.type || 'PersonaNaturalHonduras',
                [name]: formattedDNI,
            },
        }));
    };
    
    const handleRepresentanteDNIChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const formattedDNI = formatDNI(value);

        setFormState((prev: ClienteFormState) => ({
            ...prev,
            representanteLegal: {
                ...(prev.representanteLegal as PersonaNaturalHonduras),
                type: (prev.representanteLegal as any)?.type || 'PersonaNaturalHonduras', 
                [name]: formattedDNI,
            }
        }));
    };

    const isValidEmail = (email: string): boolean => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const isValidPhoneNumber = (phone: string): boolean => {
        return /^\+?[1-9]\d{1,14}$/.test(phone);
    };
    
    const isRTNUnique = async (rtn: string): Promise<boolean> => {
        if (!rtn) return true; 
        const q = query(collection(db, "clientes"), where("personaCliente.rtn", "==", rtn));
        const snapshot = await getDocs(q);
        
        if (editingClient && editingClient.id) {
            return snapshot.empty || snapshot.docs.every(doc => doc.id === editingClient!.id);
        }
        return snapshot.empty;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAuthorized || !userProfile) { 
            toast({ title: "Acceso Denegado", description: "No tienes permisos para realizar esta acción.", variant: "destructive" });
            return;
        }

        const { email, telefonoFijo, telefonoMovil, personaCliente, representanteLegal } = formState;

        if (email && !isValidEmail(email)) {
            toast({ title: "Entrada Inválida", description: "Email de cliente inválido.", variant: "destructive" });
            return;
        }
        if (telefonoFijo && !isValidPhoneNumber(telefonoFijo)) {
            toast({ title: "Entrada Inválida", description: "Teléfono fijo inválido.", variant: "destructive" });
            return;
        }
        if (telefonoMovil && !isValidPhoneNumber(telefonoMovil)) {
            toast({ title: "Entrada Inválida", description: "Teléfono móvil inválido.", variant: "destructive" });
            return;
        }
        
        const pc = personaCliente as any;

        if (pc?.type === 'PersonaNaturalHonduras') {
            const pnh = personaCliente as PersonaNaturalHonduras;
            if (!pnh.dni || !/^\d{4}-\d{4}-\d{5}$/.test(pnh.dni)) {
                toast({ title: "Entrada Inválida", description: "DNI inválido para Persona Natural Honduras. Formato: ####-####-#####", variant: "destructive" });
                return;
            }
            if (pnh.rtn && !(await isRTNUnique(pnh.rtn))) {
                 toast({ title: "Conflicto de Datos", description: "El RTN ya está en uso.", variant: "destructive" });
                 return;
            }
        }
        
        if (pc?.type === 'PersonaJuridicaHonduras') {
            const pjh = personaCliente as PersonaJuridicaHonduras;
             if (!pjh.rtn || !(await isRTNUnique(pjh.rtn))) {
                 toast({ title: "Conflicto de Datos", description: "El RTN ya está en uso.", variant: "destructive" });
                 return;
            }
            if (!representanteLegal) {
                toast({ title: "Entrada Requerida", description: "Representante Legal es obligatorio para Persona Jurídica Honduras.", variant: "destructive" });
                return;
            }
        }

        if (pc?.type === 'PersonaJuridicaExtranjera') {
            const pje = personaCliente as PersonaJuridicaExtranjera;
            if (pje.correoElectronicoOficial && !isValidEmail(pje.correoElectronicoOficial)) {
                toast({ title: "Entrada Inválida", description: "Correo Electrónico Oficial inválido para Persona Jurídica Extranjera.", variant: "destructive" });
                return;
            }
             if (!representanteLegal) {
                toast({ title: "Entrada Requerida", description: "Representante Legal es obligatorio para Persona Jurídica Extranjera.", variant: "destructive" });
                return;
            }
        }
        
        const rl = representanteLegal as any;
        if (rl && rl.type === 'PersonaNaturalHonduras') {
            const rlHonduras = representanteLegal as PersonaNaturalHonduras;
            if (!rlHonduras.dni || !/^\d{4}-\d{4}-\d{5}$/.test(rlHonduras.dni)) {
                toast({ title: "Entrada Inválida", description: "DNI del Representante Legal inválido. Formato: ####-####-#####", variant: "destructive" });
                return;
            }
        }

        try {
            const actorUserId = userProfile.id as UserId;
            const commonLogDetails: Partial<Omit<ClientLogWrite, 'userId' | 'actionType' | 'timestamp'>> = {
                targetUid: null, 
                residenciaId: undefined, // Define if applicable, e.g., formState.residenciaId if clients are linked
            };

            if (editingClient && editingClient.id) {
                const clientId = editingClient.id;
                const clientRef = doc(db, 'clientes', clientId);
                await updateDoc(clientRef, formState as DocumentData);
                await writeClientLog(actorUserId, 'log_cliente', {
                    ...commonLogDetails,
                    relatedDocPath: `clientes/${clientId}`,
                    details: { action: 'update', clientId: clientId, editorEmail: userProfile.email, newData: formState }
                });
                toast({ title: "Éxito", description: "Cliente actualizado con éxito" });
            } else {
                const docRef = await addDoc(collection(db, 'clientes'), formState as DocumentData);
                await writeClientLog(actorUserId, 'log_cliente', {
                    ...commonLogDetails,
                    relatedDocPath: `clientes/${docRef.id}`,
                    details: { action: 'create', clientId: docRef.id, creatorEmail: userProfile.email, data: formState }
                });
                toast({ title: "Éxito", description: "Cliente creado con éxito" });
            }
            setFormState({});
            setEditingClient(null);
            fetchClients(); 
        } catch (err) {
            console.error("Error guardando cliente:", err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            toast({ title: "Error al Guardar", description: `Error guardando cliente: ${errorMessage}`, variant: "destructive" });
        }
    };

    const handleEdit = (client: Cliente) => {
        setFormState(client);
        setEditingClient(client);
    };

    const handleDelete = async (clientId: string) => {
        if (!isAuthorized || !userProfile) {
            toast({ title: "Acceso Denegado", description: "No tienes permisos para eliminar.", variant: "destructive" });
            return;
        }
        if (window.confirm("¿Está seguro de que desea eliminar este cliente?")) {
            try {
                await deleteDoc(doc(db, 'clientes', clientId));
                await writeClientLog(userProfile.id as UserId, 'log_cliente', {
                    targetUid: null,
                    relatedDocPath: `clientes/${clientId}`,
                    details: { action: 'delete', clientId: clientId, deleterEmail: userProfile.email }
                });
                toast({ title: "Éxito", description: "Cliente eliminado con éxito" });
                fetchClients(); 
            } catch (err) {
                console.error("Error eliminando cliente:", err);
                const errorMessage = err instanceof Error ? err.message : String(err);
                toast({ title: "Error al Eliminar", description: `Error eliminando cliente: ${errorMessage}`, variant: "destructive" });
            }
        }
    };

    if (profileLoading || authFirebaseLoading) return <p>Cargando autenticación y perfil...</p>;
    if (authFirebaseError) return <p>Error de autenticación: {authFirebaseError.message}. No se puede cargar la página.</p>;
    if (profileError) return <p>Error de perfil: {profileError}. No se puede cargar la página.</p>;
    if (!authUser) {
        return <p>Redirigiendo a login...</p>; 
    }
    if (!isAuthorized) {
        return <p>Acceso denegado. No tienes los permisos necesarios.</p>;
    }
    
    const personaClienteType = (formState.personaCliente as any)?.type || 'PersonaNaturalHonduras';
    const representanteLegalType = (formState.representanteLegal as any)?.type || 'PersonaNaturalHonduras';

    return (
        <div style={{ padding: '20px' }}>
            <h1>Gestión de Clientes (Rol: Master)</h1>
            <form onSubmit={handleSubmit}>
                <h2>{editingClient ? 'Editar Cliente' : 'Crear Nuevo Cliente'}</h2>

                <div>
                    <label>Email Cliente:</label>
                    <input type="email" name="email" value={formState.email || ''} onChange={handleInputChange} />
                </div>
                <div>
                    <label>Teléfono Fijo:</label>
                    <input type="tel" name="telefonoFijo" value={formState.telefonoFijo || ''} onChange={handleInputChange} />
                </div>
                <div>
                    <label>Teléfono Móvil:</label>
                    <input type="tel" name="telefonoMovil" value={formState.telefonoMovil || ''} onChange={handleInputChange} />
                </div>

                <h3>Datos Persona Cliente</h3>
                <div>
                    <label>Tipo de Persona Cliente:</label>
                    <select name="personaType" value={personaClienteType} onChange={handlePersonaChange}>
                        <option value="PersonaNaturalHonduras">Persona Natural Honduras</option>
                        <option value="PersonaNaturalExtranjera">Persona Natural Extranjera</option>
                        <option value="PersonaJuridicaHonduras">Persona Jurídica Honduras</option>
                        <option value="PersonaJuridicaExtranjera">Persona Jurídica Extranjera</option>
                    </select>
                </div>

                {personaClienteType === 'PersonaNaturalHonduras' && (
                    <>
                        <div><label>Nombre Completo:</label><input type="text" name="nombreCompleto" value={(formState.personaCliente as PersonaNaturalHonduras)?.nombreCompleto || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>DNI:</label><input type="text" name="dni" value={(formState.personaCliente as PersonaNaturalHonduras)?.dni || ''} onChange={handleDNIChange} placeholder="####-####-#####" required /></div>
                        <div><label>Pasaporte (Opcional):</label><input type="text" name="pasaporte" value={(formState.personaCliente as PersonaNaturalHonduras)?.pasaporte || ''} onChange={handlePersonaChange} /></div>
                        <div><label>RTN:</label><input type="text" name="rtn" value={(formState.personaCliente as PersonaNaturalHonduras)?.rtn || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Fecha de Nacimiento (Opcional):</label><input type="date" name="fechaNacimiento" value={(formState.personaCliente as PersonaNaturalHonduras)?.fechaNacimiento || ''} onChange={handlePersonaChange} /></div>
                        <div><label>Profesión u Oficio:</label><input type="text" name="profesionUOficio" value={(formState.personaCliente as PersonaNaturalHonduras)?.profesionUOficio || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Domicilio:</label><input type="text" name="domicilio" value={(formState.personaCliente as PersonaNaturalHonduras)?.domicilio || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Municipio:</label><input type="text" name="municipio" value={(formState.personaCliente as PersonaNaturalHonduras)?.municipio || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Departamento:</label><input type="text" name="departamento" value={(formState.personaCliente as PersonaNaturalHonduras)?.departamento || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Estado Civil:</label><input type="text" name="estadoCivil" value={(formState.personaCliente as PersonaNaturalHonduras)?.estadoCivil || ''} onChange={handlePersonaChange} required /></div>
                    </>
                )}

                {personaClienteType === 'PersonaNaturalExtranjera' && (
                    <>
                        <div><label>Nombre Completo (según pasaporte):</label><input type="text" name="nombreCompleto" value={(formState.personaCliente as PersonaNaturalExtranjera)?.nombreCompleto || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Fecha de Nacimiento (Opcional):</label><input type="date" name="fechaNacimiento" value={(formState.personaCliente as PersonaNaturalExtranjera)?.fechaNacimiento || ''} onChange={handlePersonaChange} /></div>
                        <div><label>Nacionalidad (según pasaporte):</label><input type="text" name="nacionalidad" value={(formState.personaCliente as PersonaNaturalExtranjera)?.nacionalidad || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Número de Pasaporte:</label><input type="text" name="númeroDePasaporte" value={(formState.personaCliente as PersonaNaturalExtranjera)?.númeroDePasaporte || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Dirección Física Completa (residencia actual):</label><textarea name="direccionFísica" value={(formState.personaCliente as PersonaNaturalExtranjera)?.direccionFísica || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>País/Estado Dirección Física (ej: Brasil / Sao Paulo):</label><input type="text" name="paisEstadoDireccionFisica" value={(formState.personaCliente as PersonaNaturalExtranjera)?.paisEstadoDireccionFisica || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Estado Civil:</label><input type="text" name="estadoCivil" value={(formState.personaCliente as PersonaNaturalExtranjera)?.estadoCivil || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Actividad Profesional o Comercial (Opcional):</label><input type="text" name="actividadProfesionalOComercial" value={(formState.personaCliente as PersonaNaturalExtranjera)?.actividadProfesionalOComercial || ''} onChange={handlePersonaChange} /></div>
                        <div><label>Imagen Pasaporte (URL, Opcional):</label><input type="url" name="imagenPasaporte" value={(formState.personaCliente as PersonaNaturalExtranjera)?.imagenPasaporte || ''} onChange={handlePersonaChange} /></div>
                    </>
                )}

                {personaClienteType === 'PersonaJuridicaHonduras' && (
                    <>
                        <div><label>Razón Social:</label><input type="text" name="razonSocial" value={(formState.personaCliente as PersonaJuridicaHonduras)?.razonSocial || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>RTN:</label><input type="text" name="rtn" value={(formState.personaCliente as PersonaJuridicaHonduras)?.rtn || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Dirección Física:</label><input type="text" name="direccionFísica" value={(formState.personaCliente as PersonaJuridicaHonduras)?.direccionFísica || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Municipio:</label><input type="text" name="municipio" value={(formState.personaCliente as PersonaJuridicaHonduras)?.municipio || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Departamento:</label><input type="text" name="departamento" value={(formState.personaCliente as PersonaJuridicaHonduras)?.departamento || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Correo Electrónico Oficial (Opcional):</label><input type="email" name="correoElectronicoOficial" value={(formState.personaCliente as PersonaJuridicaHonduras)?.correoElectronicoOficial || ''} onChange={handlePersonaChange} /></div>
                    </>
                )}

                {personaClienteType === 'PersonaJuridicaExtranjera' && (
                    <>
                        <div><label>Nombre Legal Completo:</label><input type="text" name="nombreLegalCompleto" value={(formState.personaCliente as PersonaJuridicaExtranjera)?.nombreLegalCompleto || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>País de Constitución:</label><input type="text" name="paisConstitucion" value={(formState.personaCliente as PersonaJuridicaExtranjera)?.paisConstitucion || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Ciudad de Constitución:</label><input type="text" name="ciudadConstitucion" value={(formState.personaCliente as PersonaJuridicaExtranjera)?.ciudadConstitucion || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Número de Registro Mercantil:</label><input type="text" name="numeroRegistroMercantil" value={(formState.personaCliente as PersonaJuridicaExtranjera)?.numeroRegistroMercantil || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Identificación Fiscal:</label><input type="text" name="identificacionFiscal" value={(formState.personaCliente as PersonaJuridicaExtranjera)?.identificacionFiscal || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Dirección Legal Completa de la Sede:</label><textarea name="direccionLegalCompletaSede" value={(formState.personaCliente as PersonaJuridicaExtranjera)?.direccionLegalCompletaSede || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Correo Electrónico Oficial (Opcional):</label><input type="email" name="correoElectronicoOficial" value={(formState.personaCliente as PersonaJuridicaExtranjera)?.correoElectronicoOficial || ''} onChange={handlePersonaChange} /></div>
                        <div><label>Teléfono Oficial:</label><input type="tel" name="telefonoOfifical" value={(formState.personaCliente as PersonaJuridicaExtranjera)?.telefonoOfifical || ''} onChange={handlePersonaChange} required /></div> {/* Note: 'telefonoOfifical' as per your interface; if it's a typo for 'telefonoOficial', adjust here and in the interface. */}
                        <div><label>Objeto Social:</label><textarea name="objetoSocial" value={(formState.personaCliente as PersonaJuridicaExtranjera)?.objetoSocial || ''} onChange={handlePersonaChange} required /></div>
                        <div><label>Acta Constitutiva (URL):</label><input type="url" name="actaConstitutiva" value={(formState.personaCliente as PersonaJuridicaExtranjera)?.actaConstitutiva || ''} onChange={handlePersonaChange} required /></div>
                    </>
                )}


                {(personaClienteType === 'PersonaJuridicaHonduras' || personaClienteType === 'PersonaJuridicaExtranjera') && (
                    <>
                        <h3>Datos Representante Legal</h3>
                         <div>
                            <label>Tipo de Persona (Representante):</label>
                            <select name="representanteType" value={representanteLegalType} onChange={handleRepresentanteLegalChange}>
                                <option value="PersonaNaturalHonduras">Persona Natural Honduras</option>
                                <option value="PersonaNaturalExtranjera">Persona Natural Extranjera</option>
                            </select>
                        </div>

                        {representanteLegalType === 'PersonaNaturalHonduras' && (
                            <>
                                <div><label>Nombre Completo (Rep.):</label><input type="text" name="nombreCompleto" value={(formState.representanteLegal as PersonaNaturalHonduras)?.nombreCompleto || ''} onChange={handleRepresentanteLegalChange} required /></div>
                                <div><label>DNI (Rep.):</label><input type="text" name="dni" value={(formState.representanteLegal as PersonaNaturalHonduras)?.dni || ''} onChange={handleRepresentanteDNIChange} placeholder="####-####-#####" required /></div>
                                <div><label>Pasaporte (Rep., Opcional):</label><input type="text" name="pasaporte" value={(formState.representanteLegal as PersonaNaturalHonduras)?.pasaporte || ''} onChange={handleRepresentanteLegalChange} /></div>
                                <div><label>RTN (Rep.):</label><input type="text" name="rtn" value={(formState.representanteLegal as PersonaNaturalHonduras)?.rtn || ''} onChange={handleRepresentanteLegalChange} required /></div>
                                <div><label>Fecha de Nacimiento (Rep., Opcional):</label><input type="date" name="fechaNacimiento" value={(formState.representanteLegal as PersonaNaturalHonduras)?.fechaNacimiento || ''} onChange={handleRepresentanteLegalChange} /></div>
                                <div><label>Profesión u Oficio (Rep.):</label><input type="text" name="profesionUOficio" value={(formState.representanteLegal as PersonaNaturalHonduras)?.profesionUOficio || ''} onChange={handleRepresentanteLegalChange} required /></div>
                                <div><label>Domicilio (Rep.):</label><input type="text" name="domicilio" value={(formState.representanteLegal as PersonaNaturalHonduras)?.domicilio || ''} onChange={handleRepresentanteLegalChange} required /></div>
                                <div><label>Municipio (Rep.):</label><input type="text" name="municipio" value={(formState.representanteLegal as PersonaNaturalHonduras)?.municipio || ''} onChange={handleRepresentanteLegalChange} required /></div>
                                <div><label>Departamento (Rep.):</label><input type="text" name="departamento" value={(formState.representanteLegal as PersonaNaturalHonduras)?.departamento || ''} onChange={handleRepresentanteLegalChange} required /></div>
                                <div><label>Estado Civil (Rep.):</label><input type="text" name="estadoCivil" value={(formState.representanteLegal as PersonaNaturalHonduras)?.estadoCivil || ''} onChange={handleRepresentanteLegalChange} required /></div>
                            </>
                        )}

                        {representanteLegalType === 'PersonaNaturalExtranjera' && (
                            <>
                                <div><label>Nombre Completo (Rep., según pasaporte):</label><input type="text" name="nombreCompleto" value={(formState.representanteLegal as PersonaNaturalExtranjera)?.nombreCompleto || ''} onChange={handleRepresentanteLegalChange} required /></div>
                                <div><label>Fecha de Nacimiento (Rep., Opcional):</label><input type="date" name="fechaNacimiento" value={(formState.representanteLegal as PersonaNaturalExtranjera)?.fechaNacimiento || ''} onChange={handleRepresentanteLegalChange} /></div>
                                <div><label>Nacionalidad (Rep., según pasaporte):</label><input type="text" name="nacionalidad" value={(formState.representanteLegal as PersonaNaturalExtranjera)?.nacionalidad || ''} onChange={handleRepresentanteLegalChange} required /></div>
                                <div><label>Número de Pasaporte (Rep.):</label><input type="text" name="númeroDePasaporte" value={(formState.representanteLegal as PersonaNaturalExtranjera)?.númeroDePasaporte || ''} onChange={handleRepresentanteLegalChange} required /></div>
                                <div><label>Dirección Física Completa (Rep., residencia actual):</label><textarea name="direccionFísica" value={(formState.representanteLegal as PersonaNaturalExtranjera)?.direccionFísica || ''} onChange={handleRepresentanteLegalChange} required /></div>
                                <div><label>País/Estado Dirección Física (Rep., ej: Brasil / Sao Paulo):</label><input type="text" name="paisEstadoDireccionFisica" value={(formState.representanteLegal as PersonaNaturalExtranjera)?.paisEstadoDireccionFisica || ''} onChange={handleRepresentanteLegalChange} required /></div>
                                <div><label>Estado Civil (Rep.):</label><input type="text" name="estadoCivil" value={(formState.representanteLegal as PersonaNaturalExtranjera)?.estadoCivil || ''} onChange={handleRepresentanteLegalChange} required /></div>
                                <div><label>Actividad Profesional o Comercial (Rep., Opcional):</label><input type="text" name="actividadProfesionalOComercial" value={(formState.representanteLegal as PersonaNaturalExtranjera)?.actividadProfesionalOComercial || ''} onChange={handleRepresentanteLegalChange} /></div>
                                <div><label>Imagen Pasaporte (Rep., URL, Opcional):</label><input type="url" name="imagenPasaporte" value={(formState.representanteLegal as PersonaNaturalExtranjera)?.imagenPasaporte || ''} onChange={handleRepresentanteLegalChange} /></div>
                            </>
                        )}
                    </>
                )}

                <button type="submit" style={{ marginTop: '20px' }}>{editingClient ? 'Actualizar Cliente' : 'Guardar Cliente'}</button>
                {editingClient && <button type="button" onClick={() => { setEditingClient(null); setFormState({}); }} style={{ marginLeft: '10px' }}>Cancelar Edición</button>}
            </form>

            <h2 style={{ marginTop: '30px' }}>Lista de Clientes</h2>
            {clients.length === 0 ? <p>No hay clientes registrados.</p> : (
                <table border={1} style={{ width: '100%', marginTop: '10px' }}>
                    <thead>
                        <tr>
                            <th>ID Cliente</th>
                            <th>Nombre/Razón Social</th>
                            <th>Email</th>
                            <th>Tipo Persona</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map(client => (
                            <tr key={client.id}>
                                <td>{client.id}</td>
                                <td>{
                                    (client.personaCliente as PersonaNaturalHonduras)?.nombreCompleto ||
                                    (client.personaCliente as PersonaNaturalExtranjera)?.nombreCompleto ||
                                    (client.personaCliente as PersonaJuridicaHonduras)?.razonSocial ||
                                    (client.personaCliente as PersonaJuridicaExtranjera)?.nombreLegalCompleto || 'N/A'
                                }</td>
                                <td>{client.email || 'N/A'}</td>
                                <td>{(client.personaCliente as any)?.type || 'Desconocido'}</td>
                                <td>
                                    <button onClick={() => handleEdit(client)}>Editar</button>
                                    <button onClick={() => handleDelete(client.id!)} style={{ marginLeft: '5px' }}>Eliminar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default CrearClientePage;
