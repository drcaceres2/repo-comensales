import { admin, db } from "../lib/firebase";
import {
  onCall,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https";
import * as functions from "firebase-functions/v2";
import { Timestamp } from "firebase-admin/firestore";
import { Usuario } from "../../../shared/schemas/usuarios";
import {
  Residencia,
  ConfiguracionResidencia,
} from "../../../shared/schemas/residencia";
import {
  DietaData,
} from "../../../shared/schemas/complemento1";
import {
  GrupoComida,
  TiempoComida,
  HorarioSolicitudData,
  ConfiguracionAlternativa,
  DefinicionAlternativa,
} from "../../../shared/schemas/horarios";
import { DiaDeLaSemana } from "../../../shared/schemas/fechas";
import { logAction } from "../common/logging";

// Helper function to create a user (unchanged)
async function createUser(
  email: string,
  password: string,
  profileData: Omit<Usuario, "id" | "timestampCreacion" | "timestampActualizacion">
) {
  let newUserRecord: admin.auth.UserRecord;
  try {
    newUserRecord = await admin.auth().createUser({
      email,
      emailVerified: true,
      password,
      displayName: `${profileData.nombre} ${profileData.apellido}`.trim(),
      disabled: false,
    });
    functions.logger.info(`Successfully created user in Firebase Auth: ${email}`);
  } catch (error: any) {
    if (error.code === "auth/email-already-exists") {
      functions.logger.info(`User ${email} already exists. Skipping creation.`);
      const user = await admin.auth().getUserByEmail(email);
      const userDoc = await db.collection("usuarios").doc(user.uid).get();
      if (userDoc.exists) {
        return userDoc.data() as Usuario;
      }
      newUserRecord = user;
    } else {
      functions.logger.error(`Error creating user ${email} in Firebase Auth:`, error);
      throw new HttpsError("internal", `User Auth creation failed: ${error.message}`);
    }
  }

  const newUserId = newUserRecord.uid;
  const now = new Date().toISOString();

  try {
    const claimsToSet = { roles: profileData.roles, isActive: true, email, residenciaId: profileData.residenciaId };
    await admin.auth().setCustomUserClaims(newUserId, claimsToSet);
    functions.logger.info(`Custom claims set for user: ${email}`);
  } catch (error: any) {
    functions.logger.error(`Error setting custom claims for user: ${newUserId}`, error);
    await admin.auth().deleteUser(newUserId).catch((delErr) => functions.logger.error("Failed to cleanup auth user after claims error", delErr));
    throw new HttpsError("internal", `Setting custom claims failed: ${error.message}`);
  }

  const usuarioDoc: Usuario = {
    id: newUserId,
    ...profileData,
    timestampCreacion: now,
    timestampActualizacion: now,
  };

  try {
    await db.collection("usuarios").doc(newUserId).set(usuarioDoc);
    functions.logger.info(`Successfully created Usuario in Firestore: ${newUserId}`);
    await logAction(
      { uid: usuarioDoc.id, token: { email: usuarioDoc.email } },
      {
        action: "USUARIO_CREADO",
        targetId: usuarioDoc.id,
        targetCollection: "usuarios",
        details: { message: "Usuario creado desde Cloud Functions (seed)" },
      }
    );
    return usuarioDoc;
  } catch (error: any) {
    functions.logger.error(`Error writing Usuario to Firestore: ${newUserId}`, error);
    await admin.auth().deleteUser(newUserId).catch((delErr) => functions.logger.error("Failed to cleanup auth user after Firestore error", delErr));
    throw new HttpsError("internal", `Usuario Firestore write failed: ${error.message}`);
  }
}

export const seedDatabase = onCall(
  {
    region: "us-central1",
    cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
  },
  async (request: CallableRequest) => {
    functions.logger.warn("********************************************************************");
    functions.logger.warn("WARNING: Executing seedDatabase.");
    functions.logger.warn("This function is for local development ONLY.");
    functions.logger.warn("IT MUST BE DELETED BEFORE DEPLOYING TO PRODUCTION.");
    functions.logger.warn("********************************************************************");

    try {
      // Create Users
      const adminUser = await createUser("admin1@test.com", "123456", {
        nombre: "Admin", apellido: "Uno", nombreCorto: "A1", roles: ["admin"], estaActivo: true, email: "admin1@test.com", tieneAutenticacion: true, grupos: [], puedeTraerInvitados: "no", residenciaId: "guaymura",
      });
      const directorUser = await createUser("director1@test.com", "123456", {
        nombre: "Director", apellido: "Uno", nombreCorto: "D1", roles: ["director"], estaActivo: true, email: "director1@test.com", tieneAutenticacion: true, grupos: [], puedeTraerInvitados: "si", residenciaId: "guaymura",
      });
      for (let i = 1; i <= 10; i++) {
        await createUser(`residente${i}@test.com`, "123456", {
          nombre: `Residente`, apellido: `${i}`, nombreCorto: `R${i}`, roles: ["residente"], estaActivo: true, email: `residente${i}@test.com`, tieneAutenticacion: true, grupos: [], puedeTraerInvitados: "no", residenciaId: "guaymura",
        });
      }
      await createUser("asistente1@test.com", "123456", {
        nombre: "Asistente", apellido: "Uno", nombreCorto: "AS1", roles: ["asistente"], estaActivo: true, email: "asistente1@test.com", tieneAutenticacion: true, grupos: [], puedeTraerInvitados: "no", residenciaId: "guaymura",
      });
      await createUser("asistente2@test.com", "123456", {
        nombre: "Asistente", apellido: "Dos", nombreCorto: "AS2", roles: ["asistente"], estaActivo: true, email: "asistente2@test.com", tieneAutenticacion: true, grupos: [], puedeTraerInvitados: "no", residenciaId: "guaymura",
      });
      await createUser("asistente3@test.com", "123456", {
        nombre: "Asistente", apellido: "Tres (Residente)", nombreCorto: "AS3", roles: ["asistente", "residente"], estaActivo: true, email: "asistente3@test.com", tieneAutenticacion: true, grupos: [], puedeTraerInvitados: "no", residenciaId: "guaymura",
      });

      // Create Residences
      const residenciaGuaymura: Residencia = {
        id: "guaymura",
        nombre: "Residencia Guaymura",
        tipo: { tipoResidentes: 'estudiantes', modalidadResidencia: 'hombres' },
        ubicacion: {
          pais: 'Honduras',
          region: 'Francisco Morazán',
          ciudad: 'Tegucigalpa',
          zonaHoraria: 'America/Tegucigalpa',
          direccion: 'Blvd. San Juan Bosco, costado norte Kia Motors'
        },
        estadoContrato: 'prueba',
        estado: 'activo',
        contextoTraduccion: 'es'
      };
      await db.collection("residencias").doc("guaymura").set(residenciaGuaymura);

      const residencia2: Residencia = {
        id: "residencia2",
        nombre: "Residencia Dos",
        tipo: { tipoResidentes: 'profesionales', modalidadResidencia: 'mujeres' },
        ubicacion: {
          pais: 'Honduras',
          region: 'Cortés',
          ciudad: 'San Pedro Sula',
          zonaHoraria: 'America/Tegucigalpa',
          direccion: '33A 4C NO Bella Vista # 343'
        },
        estadoContrato: 'inactivo',
        estado: 'activo',
        contextoTraduccion: 'es-HN'
      };
      await db.collection("residencias").doc("residencia2").set(residencia2);

      const residencia3: Residencia = {
        id: "residencia3",
        nombre: "Residencia Tres",
        tipo: { tipoResidentes: 'otro', modalidadResidencia: 'hombres' },
        ubicacion: {
          pais: 'España',
          region: 'Madrid',
          ciudad: 'Madrid',
          zonaHoraria: 'Europe/Madrid',
          direccion: 'Castellana 333'
        },
        estadoContrato: 'inactivo',
        estado: 'archivado',
        contextoTraduccion: 'es-ES'
      };
      await db.collection("residencias").doc("residencia3").set(residencia3);


      // --- CONFIGURACION RESIDENCIA GUAYMURA ---
      const configRef = db.doc("residencias/guaymura/configuracion/general");

      const dias: DiaDeLaSemana[] = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
      
      const horariosSolicitud: Record<string, HorarioSolicitudData> = {};
      dias.forEach(dia => {
        horariosSolicitud[`${dia}_2000`] = { nombre: `Fin del día ${dia}`, dia, horaSolicitud: '20:00', esPrimario: true, estaActivo: true };
      });

      const gruposComidas: Record<string, GrupoComida> = {
        'desayuno': { nombre: 'Desayuno', orden: 1, estaActivo: true },
        'almuerzo': { nombre: 'Almuerzo', orden: 2, estaActivo: true },
        'cena': { nombre: 'Cena', orden: 3, estaActivo: true },
      };

      const catalogoAlternativas: Record<string, DefinicionAlternativa> = {};
      const tiposAlternativa = ['normal', 'temprano', 'tarde', 'no_como', 'ayuno'];
      const etiquetasTipoAlternativa: Record<string, string> = {
        'normal': 'normal',
        'temprano': 'temprano',
        'tarde': 'tarde',
        'no_como': 'no como en casa',
        'ayuno': 'ayuno',
      };
      
      Object.keys(gruposComidas).forEach(grupoId => {
        tiposAlternativa.forEach(tipoAlt => {
          const tipo = (tipoAlt === 'no_como' ? 'noComoEnCasa' : tipoAlt === 'ayuno' ? 'ayuno' : 'comedor');
          catalogoAlternativas[`${grupoId}_${tipoAlt}`] = {
            nombre: `${gruposComidas[grupoId].nombre} ${etiquetasTipoAlternativa[tipoAlt]}`,
            grupoComida: grupoId,
            tipo: tipo,
            estaActiva: true,
          };
        });
      });

      const esquemaSemanal: Record<string, TiempoComida> = {};
      const configuracionesAlternativas: Record<string, ConfiguracionAlternativa> = {};

      dias.forEach(dia => {
        Object.keys(gruposComidas).forEach(grupoId => {
          const tiempoComidaId = `${dia}_${grupoId}`;
          const alternativasSecundarias: string[] = [];

          Object.keys(catalogoAlternativas).filter(altId => altId.startsWith(grupoId)).forEach(defAltId => {
            const confAltId = `${tiempoComidaId}_${defAltId.split('_')[1]}`;
            const requiereAprobacion = !["sabado", "domingo"].includes(dia) && ['temprano', 'tarde'].includes(defAltId.split('_')[1]);
            
            configuracionesAlternativas[confAltId] = {
              nombre: `${catalogoAlternativas[defAltId].nombre} ${dia}`,
              tiempoComidaId,
              definicionAlternativaId: defAltId,
              horarioSolicitudComidaId: `${dia}_2000`,
              comedorId: catalogoAlternativas[defAltId].tipo === 'comedor' ? 'principal' : undefined,
              requiereAprobacion,
              estaActivo: true,
            };
            if (!defAltId.endsWith('_normal')) {
              alternativasSecundarias.push(confAltId);
            }
          });

          esquemaSemanal[tiempoComidaId] = {
            nombre: `${gruposComidas[grupoId].nombre} ${dia}`,
            grupoComida: grupoId,
            dia,
            horaReferencia: grupoId === 'desayuno' ? '08:00' : grupoId === 'almuerzo' ? '13:00' : '20:00',
            estaActivo: true,
            alternativas: {
              principal: `${tiempoComidaId}_normal`,
              secundarias: alternativasSecundarias,
            },
          };
        });
      });

      const dietas: Record<string, DietaData> = {
        'vegetariana': {
          nombre: 'Dieta Vegetariana', identificadorAdministracion: 'VEG',
          descripcion: { tipo: 'texto_corto', descripcion: 'Sin carnes rojas, aves ni pescado.' },
          esPredeterminada: false, estado: 'aprobada_director', avisoAdministracion: 'comunicado',
          creadoPor: directorUser.id, estaActiva: true,
        },
        'sin-gluten': {
          nombre: 'Dieta Sin Gluten', identificadorAdministracion: 'SG',
          descripcion: { tipo: 'texto_corto', descripcion: 'Evita alimentos con trigo, cebada y centeno.' },
          esPredeterminada: false, estado: 'aprobada_director', avisoAdministracion: 'comunicado',
          creadoPor: directorUser.id, estaActiva: true,
        },
        'baja-en-sal': {
          nombre: 'Dieta Baja en Sal', identificadorAdministracion: 'BS',
          descripcion: { tipo: 'texto_corto', descripcion: 'Restricción de sodio en las comidas.' },
          esPredeterminada: false, estado: 'solicitada_por_residente', avisoAdministracion: 'comunicado',
          creadoPor: directorUser.id, estaActiva: true,
        },
      };

      const finalConfig: Omit<ConfiguracionResidencia, 'id'> = {
        residenciaId: 'guaymura',
        nombreCompleto: residenciaGuaymura.nombre,
        version: 1,
        fechaHoraReferenciaUltimaSolicitud: new Date().toISOString(),
        timestampUltimaSolicitud: Timestamp.now(),
        comedores: {
          'principal': { nombre: 'Comedor Principal', creadoPor: adminUser.id },
          'secundario': { nombre: 'Comedor Secundario', creadoPor: adminUser.id },
          'invitados': { nombre: 'Comedor de Invitados', creadoPor: adminUser.id },
        },
        gruposComidas,
        horariosSolicitud,
        catalogoAlternativas,
        esquemaSemanal,
        configuracionesAlternativas,
        dietas,
        gruposUsuarios: {},
        restriccionesCatalogo: {},
      };

      await configRef.set(finalConfig);

      return { success: true, message: "Database seeded successfully." };
    } catch (error: any) {
      functions.logger.error("Error seeding database:", error);
      throw new HttpsError("internal", `Database seeding failed: ${error.message}`);
    }
  }
);
