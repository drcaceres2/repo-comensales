import { db, FieldValue } from "../lib/firebase";
import {
  onCall,
  HttpsError,
  CallableRequest,
} from "firebase-functions/v2/https";
import * as functions from "firebase-functions/v2";
import { format } from "date-fns";

import {
  Residencia,
  CreateResidenciaSchema,
  UpdateResidenciaSchema,
  ConfiguracionResidencia,
  ConfiguracionResidenciaSchema,
} from "../../../shared/schemas/residencia";
import { ConfigContabilidad } from "../../../shared/schemas/contabilidad";
import {
  ComedorData,
  ComedorDataSchema,
  DietaData,
  DietaDataSchema,
} from "../../../shared/schemas/complemento1";
import { getCallerSecurityInfo } from "../common/security";
import { logAction } from "../common/logging";

interface CreateResidenciaDataPayload {
  residenciaId: string;
  profileData: Omit<Residencia, "id">;
  performedByUid?: string;
}

interface UpdateResidenciaDataPayload {
  residenciaIdToUpdate: string;
  profileData: Partial<Omit<Residencia, "id">>;
  version: number;
  performedByUid?: string;
}

interface DeleteResidenciaDataPayload {
  residenciaIdToDelete: string;
  performedByUid?: string;
}

export const createResidencia = onCall(
  {
    region: "us-central1",
    cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
    timeoutSeconds: 300,
  },
  async (request: CallableRequest<CreateResidenciaDataPayload>) => {
    const callerInfo = await getCallerSecurityInfo(request.auth);
    const data = request.data;

    functions.logger.info(`createResidencia called by: ${callerInfo.uid}`, { residenciaId: data.residenciaId });

    if (!callerInfo.isMaster) {
      throw new HttpsError("permission-denied", "Only 'master' users can create residencias.");
    }

    if (!data.residenciaId || !data.profileData) {
      throw new HttpsError("invalid-argument", "residenciaId and profileData are required.");
    }

    const validationResult = CreateResidenciaSchema.safeParse(data.profileData);

    if (!validationResult.success) {
      const zodErrors = validationResult.error.flatten();
      let errorMessage = "Validation failed: ";

      if (zodErrors.fieldErrors) {
        const fieldErrors = Object.entries(zodErrors.fieldErrors)
          .map(([field, messages]) => `${field}: ${messages?.[0] || "Invalid"}`)
          .join("; ");
        errorMessage += fieldErrors;
      }
      if (zodErrors.formErrors && zodErrors.formErrors.length > 0) {
        errorMessage += (zodErrors.fieldErrors ? "; " : "") + zodErrors.formErrors.join("; ");
      }

      functions.logger.warn("Validation failed for createResidencia:", errorMessage);
      throw new HttpsError("invalid-argument", errorMessage);
    }

    const existingDoc = await db.collection("residencias").doc(data.residenciaId).get();
    if (existingDoc.exists) {
      throw new HttpsError("already-exists", `A residencia with ID '${data.residenciaId}' already exists.`);
    }

    const batch = db.batch();

    try {
      const validatedData = validationResult.data;

      const residenciaDoc: Residencia = {
        id: data.residenciaId,
        ...validatedData,
      };
      const residenciaRef = db.collection("residencias").doc(data.residenciaId);
      batch.set(residenciaRef, residenciaDoc);
      functions.logger.info("Comenzando la creación de nueva residencia:", data.residenciaId);

      const now = format(new Date().toISOString(), "yyyy-MM-dd'T'HH:mm");
      const defaultConfigRef = db.collection("residencias").doc(data.residenciaId).collection("configuracion").doc("general");
      const defaultDieta: DietaData = {
        nombre: "Normal",
        identificadorAdministracion: "N",
        descripcion: { tipo: "texto_corto", descripcion: "Ningún régimen especial." },
        esPredeterminada: true,
        estado: "aprobada_director",
        avisoAdministracion: "comunicado",
        creadoPor: callerInfo.uid,
        estaActiva: true,
      };
      const validacionDieta = DietaDataSchema.safeParse(defaultDieta);
      if (!validacionDieta.success) {
        functions.logger.error("Initial DietaData failed validation:", validacionDieta.error);
        throw new HttpsError("internal", "Initial dieta data is invalid.");
      }

      const defaultComedor: ComedorData = {
        nombre: "Comedor Principal",
        creadoPor: callerInfo.uid,
      };
      const validacionComedor = ComedorDataSchema.safeParse(defaultComedor);
      if (!validacionComedor.success) {
        functions.logger.error("Initial ComedorData failed validation:", validacionComedor.error);
        throw new HttpsError("internal", "Initial comedor data is invalid.");
      }

      const initialConfig: ConfiguracionResidencia = {
        residenciaId: data.residenciaId,
        nombreCompleto: validatedData.nombre,
        version: 0,
        fechaHoraReferenciaUltimaSolicitud: now,
        timestampUltimaSolicitud: FieldValue.serverTimestamp(),
        dietas: {
          normal: defaultDieta,
        },
        comedores: {
          "comedor-principal": defaultComedor,
        },
        horariosSolicitud: {},
        gruposUsuarios: {},
        gruposComidas: {},
        esquemaSemanal: {},
        catalogoAlternativas: {},
        configuracionesAlternativas: {},
        restriccionesCatalogo: {},
      };
      const validacionConfig = ConfiguracionResidenciaSchema.safeParse(initialConfig);
      if (!validacionConfig.success) {
        functions.logger.error("Initial ConfiguracionResidencia failed validation:", validacionConfig.error);
        throw new HttpsError("internal", "Initial configuration data is invalid.");
      }

      batch.set(defaultConfigRef, initialConfig);
      functions.logger.info("Successfully created default Dieta for Residencia:", data.residenciaId);

      const configContabilidadRef = db.collection("residencias").doc(data.residenciaId).collection("configContabilidad").doc("general");
      const initialContabilidadConfig: ConfigContabilidad = {
        residenciaId: data.residenciaId,
        modeloClasificacion: "detallada",
        valorizacionComensales: false,
      };
      batch.set(configContabilidadRef, initialContabilidadConfig);
      functions.logger.info("Successfully created default ConfigContabilidad for Residencia:", data.residenciaId);

      await batch.commit();

      await logAction(
        { uid: callerInfo.uid, token: callerInfo.claims },
        {
          action: "RESIDENCIA_CREADA",
          targetId: data.residenciaId,
          targetCollection: "residencias",
          residenciaId: data.residenciaId,
          details: { message: `Residencia '${validatedData.nombre}' creada desde Cloud Functions` },
        }
      );

      return { success: true, residenciaId: data.residenciaId, message: "Residencia created successfully." };
    } catch (error: any) {
      functions.logger.error("Error creating Residencia in Firestore:", data.residenciaId, error);
      throw new HttpsError("internal", `Firestore write failed: ${error.message}`);
    }
  }
);

export const updateResidencia = onCall(
  {
    region: "us-central1",
    cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
  },
  async (request: CallableRequest<UpdateResidenciaDataPayload>) => {
    const callerInfo = await getCallerSecurityInfo(request.auth);
    const { residenciaIdToUpdate, profileData, version } = request.data;

    functions.logger.info(`updateResidencia called by: ${callerInfo.uid} for residencia: ${residenciaIdToUpdate}`, { profileData });

    if (!residenciaIdToUpdate || !profileData) {
      throw new HttpsError("invalid-argument", "residenciaIdToUpdate and profileData are required.");
    }

    if (Object.keys(profileData).length === 0) {
      return { success: true, message: "No changes provided." };
    }

    const canUpdate =
      callerInfo.isMaster ||
      (callerInfo.isAdmin && callerInfo.profile?.residenciaId === residenciaIdToUpdate);

    if (!canUpdate) {
      throw new HttpsError("permission-denied", "You do not have permission to update this residencia.");
    }

    const validationResult = UpdateResidenciaSchema.safeParse(profileData);

    if (!validationResult.success) {
      const zodErrors = validationResult.error.flatten();
      let errorMessage = "Validation failed: ";

      if (zodErrors.fieldErrors) {
        const fieldErrors = Object.entries(zodErrors.fieldErrors)
          .map(([field, messages]) => `${field}: ${messages?.[0] || "Invalid"}`)
          .join("; ");
        errorMessage += fieldErrors;
      }
      if (zodErrors.formErrors && zodErrors.formErrors.length > 0) {
        errorMessage += (zodErrors.fieldErrors ? "; " : "") + zodErrors.formErrors.join("; ");
      }

      functions.logger.warn("Validation failed for updateResidencia:", errorMessage);
      throw new HttpsError("invalid-argument", errorMessage);
    }

    const residenciaRef = db.collection("residencias").doc(residenciaIdToUpdate);
    const configRef = residenciaRef.collection("configuracion").doc("general");

    try {
      await db.runTransaction(async (transaction) => {
        const configDoc = await transaction.get(configRef);

        if (!configDoc.exists) {
          throw new HttpsError("not-found", "Configuration document not found.");
        }

        const configData = configDoc.data() as ConfiguracionResidencia;

        if (configData.version !== version) {
          throw new HttpsError("failed-precondition", "The data has been modified by someone else. Please reload and try again.");
        }

        const newVersion = configData.version + 1;

        const validatedData = validationResult.data;

        const firestoreUpdateData = {
          ...validatedData,
          ultimaActualizacion: FieldValue.serverTimestamp(),
        };

        transaction.update(residenciaRef, firestoreUpdateData);

        const configUpdateData: any = { version: newVersion };
        if (validatedData.nombre) {
          configUpdateData.nombreCompleto = validatedData.nombre;
        }
        const validacionConfigUpdate = ConfiguracionResidenciaSchema.pick({ version: true, nombreCompleto: true }).safeParse(configUpdateData);
        if (!validacionConfigUpdate.success) {
          functions.logger.error("Config update data failed validation:", validacionConfigUpdate.error);
          throw new HttpsError("internal", "Configuration update data is invalid.");
        }
        transaction.update(configRef, configUpdateData);
      });

      await logAction(
        { uid: callerInfo.uid, token: callerInfo.claims },
        {
          action: "RESIDENCIA_ACTUALIZADA",
          targetId: residenciaIdToUpdate,
          targetCollection: "residencias",
          residenciaId: residenciaIdToUpdate,
          details: { message: "Residencia actualizada desde Cloud Functions" },
        }
      );

      return { success: true, message: "Residencia updated successfully." };
    } catch (error: any) {
      functions.logger.error("Error updating Residencia in Firestore:", residenciaIdToUpdate, error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", `Firestore update failed: ${error.message}`);
    }
  }
);

export const deleteResidencia = onCall(
  {
    region: "us-central1",
    cors: ["http://localhost:3001", "http://127.0.0.1:3001"],
  },
  async (request: CallableRequest<DeleteResidenciaDataPayload>) => {
    const callerInfo = await getCallerSecurityInfo(request.auth);
    const data = request.data;
    const { residenciaIdToDelete } = data;

    functions.logger.info(`deleteResidencia called by: ${callerInfo.uid} for residencia: ${residenciaIdToDelete}`);

    if (!residenciaIdToDelete) {
      throw new HttpsError("invalid-argument", "residenciaIdToDelete is required.");
    }

    const targetResidenciaDoc = await db.collection("residencias").doc(residenciaIdToDelete).get();
    if (!targetResidenciaDoc.exists) {
      throw new HttpsError("not-found", `Residencia ${residenciaIdToDelete} not found.`);
    }

    if (!callerInfo.isMaster) {
      throw new HttpsError("permission-denied", "Only 'master' users can delete residencias.");
    }

    try {
      await db.collection("residencias").doc(residenciaIdToDelete).delete();
      functions.logger.info("Successfully deleted Residencia from Firestore:", residenciaIdToDelete);

      await logAction(
        { uid: callerInfo.uid, token: callerInfo.claims },
        {
          action: "RESIDENCIA_ELIMINADA",
          targetId: residenciaIdToDelete,
          targetCollection: "residencias",
          residenciaId: residenciaIdToDelete,
          details: { message: "Residencia eliminada desde Cloud Functions" },
        }
      );

      return { success: true, message: "Residencia deleted successfully." };
    } catch (error: any) {
      functions.logger.error("Error deleting Residencia from Firestore:", residenciaIdToDelete, error);
      throw new HttpsError("internal", `Firestore deletion failed: ${error.message}`);
    }
  }
);
